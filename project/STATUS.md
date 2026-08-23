# Status — 2026-08-23

> **A snapshot, REPLACED in place, never appended to.** Dated "update —"
> bullets belong in `journal/`. Deleting a line that has stopped being true
> loses nothing — `journal/` and the git log are lossless. Capped at 150 lines
> by `.githooks/pre-commit`, because `PROGRESS.md` accreted instead and drifted
> five months stale while still reading as current.

**`main`**, zero `any`, `pnpm run check` **12/12** re-verified 2026-08-23 after
the grade and camera work. Perf is **uncertified** — see below; two runs voided
on a contended machine.

## The session goal — and the correction

Finish every plan in `docs/plans/`, then take the game to AAA. The 2026-08-23
audit found **no plan DONE and 6 of 37 done-boxes ticked**. Since then
**`2026-08-21-opus-harness-daemon` is built, verified and archived**, and
**`2026-08-21-fable-sibling-ports` is at 5 of 6 done-boxes** — Waves 1 and 2
done bar 3.6 (another lane's), Wave 3 five of six, Wave 4 three of five.
**Deliberately not archived**: its open box is a *failing* perf gate, and
3.8 is measured but unbuilt. `project/handoff/sibling-ports.md` is the file to
read first. Four plans open; `docs/plans/README.md` has the graph.

## Live right now — nobody

All lanes merged, no orphaned processes. **After any merge: `build:full`**, not
`build` — `build` deletes the painted-face cache without replacing it and cold
boot silently regresses 6.9 -> ~9 s. Then `pnpm run check`.

## The harness, since 2026-08-23

**`src/tools/README.md` is the contract — it now carries the detail this
section used to duplicate.** One daemon per repository; nobody starts a server,
picks a port or launches a browser. Every tool defaults to `--build HEAD`, so an
uncommitted edit is not in your frame unless you pass `--dirty`. `daemon.mts
--health`, `identity.mts`, `bench.mts` re-derives every default. **pre-commit**
is the fast lane, **pre-push** runs `check:gate`.

## The grade — measured against a judge with a control

`src/tools/compare.mts` runs a blind A/B against pixel-sampled FFXV plates in
`docs/reference/`. **`--control` is not optional**: without it a round cannot
tell a real gap from a saturated instrument.
Ten rounds, 3 -> 4.5/10, **never fooled it**. Its own answer for what gives us
away is **authoring** — *"the same few instances repeated"* — not rendering
defects: the absence of someone having chosen.

**The grade was rebuilt 2026-08-23** (sibling-ports 3.3/3.4): median range
**9.46 -> 11.06 stops** against 9.79, black point 3.5 -> 1.1, daylight slice 8
of 9 checks. The print fade had been capping display-white at 252/245 by
construction. **All ten rounds predate this grade; the next would be the first
to see it.**

**Open, named by four consecutive judges, nobody assigned:** cloud billboards,
and terrain that reveals its mesh (`landmark_insomnia`). Then a floating rock
arch (round 10, twice, cheap), hair, and Insomnia's massing.

## What this session learned about itself

**Seven systems were declared, documented, referenced in handoffs — and never
executed.** `orphans` proves a module is *reachable*, not that it *runs*;
**`reachcheck.mts` closes that**, gated on `project/must-run.json`. The seventh
(2026-08-23): the `HemisphereLight` is worth 0.4 luma of 87.7.

**Instruments measure themselves unless stopped.** Seven now — `imagestats`
printed prose contradicting its own numbers; `imgdiff`'s global noise floor sat
*above all twelve* measured per-shot floors, so it could never fail anything.
**Before trusting a number, make the instrument report on a case whose answer
you already know.** Boot noise is per shot and spans 16×
(`project/noise-floors.json`).

## Determinism — CLOSED

A shot alone versus sixth in a batch: **1.836 -> 0.340 mean/255** against a
0.302 floor. The cause was the **wind** (`417ca86`), not the vegetation
streaming every handoff guessed.

## Gates — 12/12, re-run end to end 2026-08-23

`vite build` + both typechecks (per-commit) · `anycheck` 0 `any` · `orphans`
**291/291** · `integration` **27 pass** · `uxcheck` **93/93** · `creaturecheck`
207 poses · `combatloop` **31/31** · `roadcheck` 0 fail · `reachcheck` every
must-run path executed · `horizoncheck` PASS (worst MCC 0.766; the gate is
`MCC >= 0.85` **or** disagreement <= 1%) · `heightcheck` 0.000 m · `driftcheck`
worst **−2.928 m** at 4310 m on `zone_cape_caem` (reported, not failed).

`driftcheck`'s −2.928 m measures the *drawn terrain surface*, which prop
placement cannot move — a lead, not a regression to chase. **The expensive
gates run at `git push`** (`check:gate`): `combatloop` slid 30/30 → 21/30
unnoticed for weeks when that was something people were asked to remember.

## Perf — uncertified

Prior certified pair (`project/baseline-*.json`): perf mean **243.7 fps** /
worst 148, gameplay worst segment **92.2 fps**, 2 hitches.

**A third run on 2026-08-23 certified and FAILED**: `RULER_VALID: true`, floor
22% of a 6.0 ms frame, **mean 166.4 fps, worst 51 fps on
`bestiary_necromancer`** against a 60 fps target. Two earlier runs voided at
27%. **Do not attribute it yet.** That shot's worst has read 179 / 150 / 51 fps
across the three runs and its *baseline* row already carried `p95 31.8 ms,
max 133.2 ms` — it is spike-dominated, and system load was ~4.5 from outside
this repo throughout. Perf takes the daemon's exclusive lease, so quiet is
enforced within the repo and not beyond it. **Re-run on an idle machine before
anyone reads the mean as a regression.**

Cost tracks **draw calls** — ~8.7 us each, corr 0.801 vs 0.628 for triangles —
so **a new visible `InstancedMesh` costs four draws, not one** (colour plus
three cascades). Per-instance variation is free.

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
3. **The camera stopped putting the lens inside hills** — 4.77% of 13,872
   sampled poses to 0.00%, and the swept sphere the plan prescribed was a
   measured negative: 100% of the failures were the `minDistance` clamp, not
   the arm test. `src/tools/probes/camsweep.mts` re-measures it in one command.
4. **Hair and eyes** — four commits, unjudged, +8 draws and +0.42 M triangles
   unmeasured. Kajiya-Kay measured as nothing (0.897/255, under the floor) and
   shifted along the strand's own normal, which can only speckle. **The inherited
   "eyes 3/10" was wrong**: with the head hidden the eyeball has radial fibres, a
   pupil, a limbal ring and a catchlight. Open: a skin-coloured wedge over a
   third of each aperture.
5. `Layers.ts` — the splat reads as one texture, not a material system; six
   layers whose mean lumas span only 0.35–0.47.
6. **Motion.** Every judgment this project has made is on a still frame.
