# Perf, round 2 — the streaming regression, and four things it was not

Owner: the perf lane, 2026-08-24. Branch `main`, committed as it went.

**Read the first two sections before anything else.** One is the state of the
gate; the other is the reason every number below is quoted the way it is.

---

## Where the gate stands

    certified baseline      round 2 opened        now
    (acdcebb, quiet)        (bc4e98dd, quiet)     (d5aefae, load 4.4)

    worst  92.2 fps         worst  52.4 fps       worst  59.5 fps
    2 hitches               21 hitches            11 hitches
                            worst frame 152 ms    worst frame 131 ms

`pnpm run check` is **16/16**. `gameplay.mts` still prints FAIL, on
`streaming-traverse` at **59.5 fps against a 60 fps target** — half a frame per
second short, and the instrument itself marks that row `~~`, meaning the segment
sits closer to the target than its own block spread and the verdict is not
resolvable. The same segment, driven by the same script from
`src/tools/probes/perfstream2.mts`, measures **14.5 ms / 69 fps**.

I do not think that gap is a real disagreement between the two instruments. It
is load: see below. **This wants one re-run on a genuinely quiet machine before
anyone concludes anything from the last 0.5 fps.** Everything else in the
session is measured by paired A/Bs that a busy machine cannot fake.

### `perf.mts` — the corpus run says FAIL and the corpus run is wrong

A full-corpus `perf.mts` at HEAD printed **`FAIL: storm at 51 fps`**, mean
154.9. Do not act on it. Every one of my commits, measured shot by shot with
`--build` — which only works at all because of the harness fix below — is
clean:

    shot                bc4e98dd   24f8e93   5316e01   60f0681   0c630dd   corpus
                        (session   (probes   (stream   (veg      (warmup   run at
                         start)     only)     budget)   budget)   fix)      HEAD
    storm                 7.30      6.95      7.05      7.40      6.85     19.55
    zone_ravatogh         5.50      5.70      5.65      5.40      5.70     17.65
    bestiary_arachne      5.40      5.30      5.95      6.05      6.05     17.25

The mechanism is the one `project/handoff/perf.md` already warns about, and it
is worth restating because it just cost an hour: **these shots carry a 25-35%
`>16 ms` tail, so their 120-sample median sits right at the edge of it.** Push
the tail's share past 50% — which machine load does — and the median jumps from
7 ms into the tail at 19 ms. Nothing about the shot changed; `storm` draws 785
calls in both runs.

So: `perf.mts`'s headline is not trustworthy on any shot whose `>16` column is
near 50%, and a corpus run taken on a busy box is not evidence either way.
**Re-run the corpus when the machine is genuinely idle before recording a
baseline.** The per-shot A/B above is the stronger evidence and it says nothing
in this round moved a posed frame — which is what `Props.converge()` exists to
guarantee.

---

## The machine was not quiet, and the brief said it was

My brief opened "You are the only lane running: the machine is yours and it is
quiet." That was false for most of the session, and it changes how everything
here had to be measured. Live on this same checkout while I worked:

- a **head/face** lane, running `probes/headprop.mts` and editing
  `src/characters/rig/Face.ts` in the working tree;
- a **rocks** lane, which committed `Rocks.ts` between my reading that file and
  my editing it, and swept my one-line edit into `d30e2aa` along with its own;
- a **vegetation** lane, running `shoot.mts` corpora.

Load averages ran 4.4–6.0 on 18 cores for most of the afternoon. Consequences
that matter to whoever reads this next:

- **`gameplay.mts` voided one of my runs and was right to.** `RULER_VALID:
  false`, noise floor growing 0.88 → 1.75 ms *during* the run. Its own message
  is the correct reading: the workload destabilised, not just the box.
- **A before/after run of the gate cannot measure a change here.** HEAD moves
  under you between the two halves. Every claim below is instead an
  interleaved A-B-B-A toggle of the changed value *at runtime, inside one page,
  on one build* — `perfbudget.mts`, `perfvegbudget2.mts`. That is the only
  shape that survives a moving trunk, and it is worth keeping as the house
  style whenever more than one lane is awake.
- `--dirty` on a shared trunk contains the other lanes' half-finished edits.
  Anything quoted here is `--build HEAD` unless it says otherwise.
- Orphaned vite servers were checked before every measurement per
  `LANDMINES.md`; there were **none** all session. That landmine did not fire.

---

## What was actually wrong

Four distinct causes, and they are genuinely unrelated to each other. The
headline "streaming regression" is only two of them.

### 1. A cell count cannot bound a cost — `TileStream`

`perftile.mts` times every streamed tile individually, and because it is a
probe it can be pointed at the certified baseline with `--build acdcebb`. Same
instrument, same machine, minutes apart, identical cell counts:

    layer     baseline        HEAD           per cell
    grass     541.0 ms        541.0 ms       2.0  -> 2.0 ms    unchanged
    rock      138.0 ms        460.6 ms       0.10 -> 0.34 ms   3.3x
    bushes    140.7 ms        213.4 ms       0.17 -> 0.57 ms   3.3x
    trees      86.8 ms         72.6 ms
    debris     65.4 ms         67.9 ms
    total     5.52 ms/frame   7.66 ms/frame

The Matérn cluster sampler made a rock cell 3.3× dearer. Nothing is wrong with
that. What was wrong is that the stream's budget is `budget: 12` — *twelve
cells* — so the same twelve cells went from 1.2 ms to 4.1 ms of frame and not
one number in any file changed.

`TileStream` now takes `budgetMs` beside `budget`, and the first cap to bite
wins. Boulders 0.6 ms, outcrops 0.4, debris 0.3. Measured by toggling
`budgetMs` between 0 (exactly the old behaviour) and the shipped values,
interleaved: **25.1 → 22.6 ms median, 93 → 20 frames over 33 ms.**

Real motion never reaches either cap. Sprinting crosses a 56 m cell in 5.6
seconds — fifteen new cells over 336 frames. Only `gameplay.mts`'s 660 m
teleport hops saturate it, which is what they are for.

**`Props.converge()`** is the other half and is not optional. `Game.settle`
calls `converge` on any system that has one, one frame after `applyShot`, with
the shot's camera in place; it flushes every prop stream unbounded. Without it
a wall-clock budget would make a posed capture depend on how fast the box was,
which is BRIEF.md §2. It is deliberately *not* a visual change — at 12 cells a
frame a 30-frame settle already drained a ~145-cell disc — and `driftcheck`,
`floatcheck` and the rest of `check` agree.

### 2. The vegetation budgets, halved again

grass 2 → 1 ms, trees 2 → 1, bushes 1 → 0.5. Interleaved A-B-B-A-A-B:
**20.4 → 17.9 ms, 49 → 55.9 fps, over 7.84 → 7.85 M resident triangles a
frame** — the same world, delivered in smaller pieces. A mid-traverse capture
at the new budget (`tmp/shots/perf-r2/vegpop-budget-full.jpg`) shows continuous
grass, foreground scrub and a fully dressed mesa; no holes.

**There is a floor here and it is worth knowing about.** The deadline is
checked *between* tiles, and a grass tile is 2 ms, so grass cannot cost less
than ~2 ms on any frame where it has work. Lowering `budgetMs` below 1 buys
nothing. Going further means making a grass tile cheaper or splitting one
across frames, not turning this knob again.

### 3. Eight POI kits that do not fit in a frame

`PoiKits.update` builds "at most one POI per frame, nearest first" with no time
budget, and a budget cannot help because one `_make` is atomic. All 123 sites,
timed individually (`perfpoi.mts`):

    type        n   median ms   max ms
    town        2      168.4    168.4      lestallum, galdin_quay
    imperial    6       32.4     36.7
    outpost     8       10.8     17.3
    haven      17        8.3     15.2
    the other 90                     <= 13.4

Median across all 123 is 6.7 ms. Only those eight break 33 ms. They are now
built during `Props.init` in their own boot phase (`Props.poiPrebuild`) and
distance-culled by `update` afterwards like any other kit.

### 4. `Warmup` could not see anything the boot camera could not see

This is the one worth reading twice, because the class exists specifically to
prevent what it was not preventing.

`Warmup`'s `shadow casters` step already forces every hidden object visible
before drawing the scene once. It still missed most of the world, because
`renderer.render` **frustum-culls**, and almost everything that boots hidden is
a long way from the camera at load. `renderer.compile` misses the same content
for a different reason: three walks the scene with `traverseVisible`.

`perfsprint.mts` — which replays the gate's own `idle`/`walk`/`sprint` first, so
the spike happens where the gate makes it happen rather than wherever a fresh
`applyShot` lands — puts the bill at the same frame index every single run:

    frame 34   226.7 ms   town_chainlink links,   +4 textures
    frame 35   119.5 ms   town_asphalt, town_glass, sign_cn link, +42 textures

`info.memory.textures` counts *uploads*, not constructions, and `perfprog.mts`
shows four of those programs were already compiled at boot. So they were
re-keyed and re-uploaded when Hammerhead first entered the frustum: 46 texture
uploads and 30 geometry uploads inside one gameplay frame.

`_warmShadows` now clears `frustumCulled` as well as `visible`, and calls
`renderer.compile` while everything is reachable. Both spikes collapse into one
**104 ms** frame with zero new programs and zero uploads, reproduced twice.
Boot pays **93 ms** for it (`shadow casters` 224 → 317 ms, 8 more programs) on
a 13 s cold load.

---

## Measured negatives — do not re-derive these

Half of what this round establishes is what the regression is *not*. Each of
these was a plausible, stated hypothesis; each is dead.

- **The heightfield did not get dearer per sample.** `perffield.mts` against
  `acdcebb`: `grassDensity` 7.03 → 7.09 µs, `scrubDensity` 6.79 → 6.82,
  `treeDensity` 6.75 → 6.89, `heightAt` 0.11 → 0.11. Drainage incision, talus
  aprons and tarn basins in `Field.ts` (+801 lines) cost **nothing** per
  sample. It is more samples, not dearer ones.
- **Grass and trees did not regress at all.** Grass tile cost is identical to
  the baseline to three figures; trees came back slightly *faster*.
- **Hair cards and the 144×120 head are innocent**, as their handoffs claimed —
  they never appear in any attribution.
- **The menu's 26 px backdrop-filter is not the menu stall.** ABBA with the
  filter forced off: 20 hitches with it, 21 without.
- **Nor is the menu DOM.** Hidden subtree: still hitches. `menus.root` removed
  from the document entirely: **still 20 hitches** against 0 with no menu.
- **Nor `Menus.update`, nor the active screen's `update`** — skipping either
  leaves it intact, and every one of the three screens shows it.
- **Nor `input.enabled = false`, nor `setPointerLockAllowed(false)`, nor
  `HUD.setMenuOpen(true)`** — each forced on with no menu open: 0 hitches.
- **Nor the visible light count.** `LightBudget`'s docstring makes it the best
  hypothesis in the building; `perflights.mts` counts visible point/spot/dir
  lights every frame across 480 frames and the count **never moves**.
- **Nor any Sky/CSM call with a frame cadence** — `perfcsm.mts` times
  `_preRender`, `_updateCascades`, `_nearGround`, `csm.update`,
  `csm.updateFrustums`, `clouds.render`, `clouds.renderShadow` and
  `shadowMap.render` per frame.
- **Nor shadow maps, nor the cascade update, as whole subsystems.**
  `perftail2.mts`, menu held open, one variable per arm, A-B-B-A: base 39
  hitches per 240 frames, `shadowMap.enabled = false` **47**, cascade update
  skipped **54**, composer bypassed **27** (worst frame 920 → 280 ms). Only the
  last helps, and only partly — the same aggregate signature `LANDMINES.md`
  records for switching off any single post pass.

---

## What is left, in the order I would take it

### A. `streaming-traverse` — and it is now the tail, not the streaming

16.8-18.4 ms across runs, 14.5 ms on a probe. Split of the 14.5
(`perfstream2/3.mts`): `post.render` 5.4, `Vegetation.update` 4.0 (grass 2.5,
bushes 1.3, trees 0.4), `Props.update` 1.7, everything else 0.9; 12.0 of 14.5
accounted.

**Read the `>16ms` column, not the median.** That segment runs 51-63% of frames
over one 60 Hz budget, which puts its median *inside* the tail — the same
instability that made the `perf.mts` corpus run print a false FAIL, and the
reason the row is flagged `~~`. The streaming work itself now fits: 11-12 ms
of accounted per-frame cost against a 16.7 ms budget, down from a saturated
19.1.

So B below is not a separate nicety — **it is what is left of this segment
too.** After that, the levers with real room are a cheaper grass tile (see the
floor in §2) and `post.render`, which is 37% of the frame and is not a
streaming problem.

### B. `menu-open` — eight hitches, and it is *not* a regression

`perfmenurepro.mts` is a 40-line repro. Run against the **certified baseline
`acdcebb`** it gives **27 hitches**; against HEAD, **26**. The
`baseline-gameplay.json` row saying `menu-open` had 0 hitches is a lucky
90-frame sample, not a state anyone has ever actually shipped.

What is established about it:

- 100% gated on a menu having been opened: 0 hitches with none, 15–21 per 120
  frames with one, over and over.
- Periodic — spike frames land on **9, 19, 29, 39, 49, 59, 69, 79, 89, 99**.
- Pure **CPU**: `gl.finish()` costs 0 ms on the spike frames; the whole
  108–168 ms is inside the JS of `post.render`, and `ScenePass` owns it
  (3.5 → 37.6 ms) with **586 vs 588 draw calls** and the same triangles.
- Creates nothing: no programs, no textures, no geometries.
- Survives every ablation in the list above.

This is the same animal as `LANDMINES.md`'s "12–31% tail", and this is the
first handle anyone has had on it: **a switch that turns it on and off
reliably.** The next person should use that switch rather than stare at frames.
`performance.memory` is frozen in this headless build, so the GC hypothesis is
untested — that is the obvious next probe, with `--js-flags=--expose-gc` or a
Chrome trace.

### C. The residual 104–131 ms `sprint+turn` frame

Down from 226 + 119 ms across two frames. What remains creates nothing, links
nothing, uploads nothing, and lands on `post.render` on the frame a large
amount of geometry enters the render list. Same signature as B. I would treat B
and C as one investigation.

---

## Reported, not edited — other lanes' files

Precise, because these are the next-biggest numbers and they are not mine.

- **`_apron` / `gradePad` / `WearField` (`src/world/props/Wear.ts`, town lane)
  is the largest shared per-POI cost**: haven 5.7 ms per site, parking 3.7,
  imperial 11.3, town 16.4, ~500 ms across all 123. It is not currently a gate
  failure — the prebuild moved the worst of it to boot — but it is what makes
  `Props.poiPrebuild` cost what it does.
- **`Water.lateUpdate` runs 1.0–2.6 ms** on `sprint+turn` frames near the
  coast (`src/world/Water.ts` / `src/world/water/**`, water lane). Second
  largest system after `post.render` there.
- **`post.render` is 5.4 ms of the 14.5 ms traverse frame** and 4.6–5.4 ms
  everywhere. `perf.md`'s attribution still holds: `ScenePass` owns ~61% of it
  and the frame is draw-call-submission bound.
- **`src/tools/probes/perfstream.mts` (previous perf lane) never sprinted.**
  Its `hold()` does `input.keys[k] = true` on a `Set`, which adds a property
  rather than a member. Its conclusions about the *hop* frames stand; anything
  it says about the cost of moving does not. `perfstream2/3.mts` replace it.

## A harness fix worth keeping

`perf.mts` and `gameplay.mts` each have a strict `parseArgs` that runs before
`harnessArgs` and threw on `--build` and `--dirty`, so **the two headline perf
gates in this repo could only ever measure `HEAD`.** No A/B, no re-measuring a
suspect regression against the baseline that certified it. `HARNESS_FLAGS` in
`harness.mts` names the flags `harnessArgs` consumes; both tools skip them, and
a genuinely unknown flag still throws.

## Files touched

- `src/world/props/TileStream.ts` — `budgetMs`, `_unbounded`, `flush` fixed.
- `src/world/Props.ts` — `converge()`, `Props.poiPrebuild` boot phase.
- `src/world/props/{Rocks,Debris}.ts` — `budgetMs` at the three call sites.
- `src/world/veg/{GrassField,Trees,Bushes}.ts` — one constant each.
- `src/world/props/PoiKits.ts` — `PREBUILD_TYPES`, `prebuildHeavy()`.
- `src/engine/Warmup.ts` — `_warmShadows` clears `frustumCulled` and compiles.
- `src/tools/{harness,perf,gameplay}.mts` — `HARNESS_FLAGS`.
- `src/tools/probes/` — 20 new probes, listed in their two commits.

Reports: `tmp/perf-r2/gp-*.json`, `tmp/perf-r2/perf-final.json`.
Captures: `tmp/shots/perf-r2/vegpop-budget-{full,half}.jpg`.
