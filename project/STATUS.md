# Status — 2026-08-23

> **A snapshot, REPLACED in place, never appended to.** No dated "update —"
> bullets: that is `journal/`. The lossless history is `journal/` and the git
> log, so deleting a line that has stopped being true loses nothing. Capped at
> 150 lines by `.githooks/pre-commit`, because `PROGRESS.md` accreted instead and
> drifted five months stale while still reading as current.

**`main`**, zero `any`, `pnpm run check` **12/12** re-verified 2026-08-23 after
the harness rebuild. Perf and gameplay last certified **PASS**,
`RULER_VALID: true`, but that predates this round's renderer work and has not
been re-certified — `pnpm run check:perf` now takes the daemon's exclusive lease,
so it no longer needs a quiet tree to be honest. **Run it.**

## The session goal — and the correction

Finish every plan in `docs/plans/`, then take the game to AAA. The 2026-08-23
audit found **no plan DONE and 6 of 37 done-boxes ticked**. Since then
**`2026-08-21-opus-harness-daemon` is built, verified and archived** — the first
plan to graduate, and the one the graph said had to go first because it rewrites
the tools. Five remain open; `docs/plans/README.md` has the graph.

## Live right now — nobody

All lanes merged, no orphaned processes. **After any merge: `pnpm run
build:full`**, not `build` — `build` deletes the painted-face cache without
replacing it and cold boot silently regresses 6.9 -> ~9 s. Then `pnpm run check`.

## The harness, since 2026-08-23

**`src/tools/README.md` is the contract. Read it before writing a tool.** One
daemon per repository serves every agent: nobody starts a server, picks a port or
launches a browser, and a hook blocks all three. Every tool takes `--build <ref>`
and **defaults to `HEAD`** — so an uncommitted edit is not in your frame unless
you pass `--dirty`, and every tool says so loudly when your tree is dirty.

`daemon.mts --health` shows pool, queues, builds and reset drift; `identity.mts`
which daemon and port; `bench.mts` re-derives every default
(`journal/2026-08-23-harness-bench.md`). **pre-commit** is the fast lane,
**pre-push** runs `check:gate`. Measured: budget **4** (the GPU binds — 2.2 of 18
cores at the cap), boot 9.2 s against a 2.3 s render, four browsers worth 1.5×
one; five agents asking one shot at one sha produce **one** render.

## The grade — measured against a judge with a control

`src/tools/compare.mts` runs a blind A/B against pixel-sampled FFXV plates in
`docs/reference/`. **`--control` is not optional**: it pairs reference plates
against each other, and a round without one cannot tell a real gap from a
saturated instrument. Validated landscape-only, it returns zero false positives.

Ten rounds. The score has barely moved (3 -> 4.5/10) and **we have never fooled
it**. What moves every round is the *cue*, each dying to the lane that owned it.
Its own unprompted answer for what gives us away is **authoring** — *"the same
few instances repeated"*, *"one smooth noise-displaced surface"*. Not rendering
defects: the absence of someone having chosen.

**Open, named by four consecutive judges, nobody assigned:** cloud billboards,
and terrain that reveals its mesh (`landmark_insomnia`). Then: a floating rock
arch (round 10, twice, cheap), hair, and Insomnia's massing — its surface landed,
its silhouette did not.

## What this session learned about itself

**Six systems were declared, documented, referenced in handoffs — and never
executed.** `orphans` passed all six: it proves a module is *reachable*, not that
it *runs*. **`reachcheck.mts` closes that**, gated on `project/must-run.json`.

**Instruments measure themselves unless stopped.** Five did. The rule: **before
trusting a number, make the instrument report on a case whose answer you already
know** — and *use a control*: two fresh boots of one shot differ by 1.493/255, so
a diff without that baseline reads boot noise as a finding. Documents drift the
same way; when a number changes, change it here. Full account:
`project/journal/2026-08-22-985c9fe3.md`.

## Determinism — CLOSED

A shot alone versus sixth in a batch: **1.836 -> 0.340 mean/255** against a 0.302
floor. The cause was the **wind**, not the vegetation streaming every handoff
guessed (`417ca86`). The daemon's reset-drift check now watches it per build.

## Gates — 12/12, re-run end to end 2026-08-23

`vite build` + both typechecks (per-commit) · `anycheck` 0 `any` · `orphans`
**291/291** · `integration` **27 pass** · `uxcheck` **93/93** · `creaturecheck`
207 poses · `combatloop` **31/31** · `roadcheck` 0 fail · `reachcheck` every
must-run path executed · `horizoncheck` PASS (worst MCC 0.766; the gate is
`MCC >= 0.85` **or** disagreement <= 1%) · `heightcheck` 0.000 m · `driftcheck`
worst **−2.928 m** at 4310 m on `zone_cape_caem` (reported, not failed).

`driftcheck`'s −1.177 m had been credited to the `Seat` work; it is back at its
pre-`Seat` −2.928 m, and the metric measures the *drawn terrain surface*, which
prop placement cannot move. **A lead, not a regression to chase.**

**The expensive gates run at `git push` now** (`pnpm run check:gate`) rather than
by convention — `combatloop` slid 30/30 → 21/30 unnoticed for weeks when "run
them at every merge" was something people were asked to remember.

## Perf — PASS, and a cautionary tale

  perf      mean **243.7 fps**, worst 148 (town_garage), floor IQR 0.82 ms — PASS
  gameplay  worst segment streaming-traverse **92.2 fps**, **2 hitches** — PASS

Both `RULER_VALID: true`. `project/baseline-*.json` are the origin; later runs go
`--baseline` against them. Quiet is *enforced* now — perf takes the daemon's
exclusive lease, draining every worker and closing every page — not hoped for.

They were the *third* set called a baseline that night — the first voided for
contention, the second wrong by 5× — and `project/LANDMINES.md` carries the rule.
Attribution on the fixed ruler: held frame 5.4 ms is `post.render` 4.2 (of which
`ScenePass` 3.3), game systems 0.9. Cost tracks **draw calls** — ~8.7 us each,
corr 0.801 vs 0.628 for triangles — so triangles and fill are nearly free and
**a new visible `InstancedMesh` costs four draws, not one** (colour plus three
cascades). Per-instance variation is free. Design to that.

## Still weak

Hair and eyes shipped unjudged. `Layers.ts`'s splat reads as one texture, not a
material system. Nothing in our frame reaches white — eight of ten reference
plates clip >=0.10%, four of our six clip at 0.00%. **A page costs 2.1 GB of RSS**
(`project/TODO.md` notices it too), which is what makes the browser budget bite.
Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata, the world map, the opening cutscene, warp-strike VFX, km-scale shadow.

## Next, in order

Three lanes were stopped mid-flight. **Their diagnoses are the deliverable; two
of the three shipped code that has never been judged.**

1. **Grounding** — the judge's #1, diagnosed as *structural*: every grounding
   term is scaled to human dimensions and every scenery object in a graded frame
   is past all of them. GTAO gathers at **0.62 m**, `ContactShadowPass` marches
   **0.5 m** (gated at 55 m), CSM `maxFar` is **190 m** — the graded shots'
   nearest ground is 61–80 m, so a boulder at 400 m gets none of the three. **A
   measured negative comes with it:** a world-metre contact ramp is dead on
   arrival, since at that range a 1.5 m shrub is eight pixels; FFXV darkens the
   object's own lower body, not a disc on the ground. Untested lead: `thickness`
   stays 0.45 while `bias` scales with distance, so the accept window is empty
   past ~140 m. `handoff/grounding.md`.
2. **Clouds** — five commits, unjudged. The field was drawn 5x too coarse,
   coverage applied twice (making it optically thin), and the march had step
   aliasing the old blur was hiding. Its last WIP commit is *unverified*.
3. **Hair and eyes** — four commits, unjudged, +8 draws and +0.42 M triangles
   unmeasured. Kajiya-Kay measured as nothing (0.897/255, under the floor) and
   shifted along the strand's own normal, which can only speckle. **The inherited
   "eyes 3/10" was wrong**: with the head hidden the eyeball has radial fibres, a
   pupil, a limbal ring and a catchlight. Open: a skin-coloured wedge over a
   third of each aperture.
4. `Layers.ts` — the splat reads as one texture, not a material system; six
   layers whose mean lumas span only 0.35–0.47.
5. **Motion.** Every judgment this project has made is on a still frame.
