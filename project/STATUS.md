# Status — 2026-08-23

> **This is a snapshot, and it is REPLACED in place, never appended to.** No
> dated "update —" bullets: that is the `journal/` genre. The lossless history is
> `journal/` and the git log, so deleting a line that has stopped being true
> loses nothing. It is capped at 150 lines by `.githooks/pre-commit` for exactly
> this reason — `PROGRESS.md` was allowed to accrete instead and drifted five
> months out of date while still reading as current.

**`main` @ 600 commits**, ~250 tonight. Zero `any`. `pnpm run check` **12/12**.
Perf and gameplay both **PASS** with `RULER_VALID: true` on a quiet tree.

## The session goal

Finish every plan in `docs/plans/` (**done** — each carries its own `Status:`),
then take the game to AAA (**not done**; see the grade).

## Live right now — nobody

All lanes merged, worktrees pruned, no orphaned processes.

**After any merge: `pnpm run build:full`** (not `build` — it deletes the
painted-face cache without replacing it, and cold boot silently regresses 6.9 ->
~9 s). Then `pnpm run check`.

## The grade — measured against a judge with a control

`src/tools/compare.mts` runs a blind A/B against pixel-sampled FFXV plates in
`docs/reference/`. **`--control` is not optional**: it pairs reference plates
against each other, and a round without one cannot tell a real gap from a
saturated instrument. Validated properly — landscape only, no characters or HUD
for a judge to recognise the *game* by instead of the *render* — it returns
**zero false positives** and declines controls at LOW while calling our frames at
HIGH.

Ten rounds. The score has barely moved (3 -> 4.5/10) and **we have never fooled
it**. What moves every round is the *cue*, and each one died to the lane that
owned it: exposure discipline, alpha speckle, ground scatter, contact AO, "one
shared body mesh reskinned across the party", the Meteor's flat facets, the
`vista_noon` placeholders. Gone from the comments, each in turn.

Its own unprompted answer for what gives us away is **authoring** — *"the same
few instances repeated"*, *"one smooth noise-displaced surface"*. Not a list of
rendering defects: the absence of someone having chosen.

**Open, named by four consecutive judges, nobody assigned:** cloud billboards,
and terrain that reveals its mesh (visible triangulation on `landmark_insomnia`).
Then: a floating rock arch (round 10, twice, cheap), hair, eyes at 3/10, and
Insomnia's massing — its surface landed, its silhouette did not.

## What this session learned about itself

**Six systems were declared, documented, referenced in handoffs — and never
executed.** `orphans` passed all six: it proves a module is *reachable*, not that
it *runs*. **`reachcheck.mts` closes that** — 1,877 methods instrumented with no
annotations, driven by real key events, gated on `project/must-run.json`.

**Five instruments were measuring themselves**, ending with a perf ruler that
throttled itself fivefold and reported 63 fps for a game running at 190 —
correlation 0.107, ranking inverted, after being written into this file as fact.
The rule: **before trusting a number, make the instrument report on a case whose
answer you already know.** It applies to tooling too — the last thing built this
session was reverted for exactly this mistake.

Full account: `project/journal/2026-08-22-985c9fe3.md`.

## Determinism — CLOSED

A shot alone versus sixth in a batch: **1.836 -> 0.340 mean/255** against a 0.302
floor. The cause was the **wind**, not the vegetation streaming every handoff had
guessed. Account in `417ca86`.

## Where the truth is

`BRIEF.md` (the contract) · `project/HANDOFF.md` (method) · `project/LANDMINES.md`
(read its last section twice) · `docs/SCOPE.md` (the inventory) ·
`project/README.md` (which document is which genre).

## Gates — 11/11, 2026-08-23

`vite build` + both typechecks (per-commit) · `anycheck` 0/0 · `orphans` 281/281 ·
`integration` **20/20** · `uxcheck` 89/89 · `creaturecheck` 207 poses ·
`combatloop` 30/30 · `roadcheck` 0 fail · `heightcheck` 0.000 m · `driftcheck`
worst −1.177 m (reported, not failed).

**Run `pnpm run check` at every merge, not just the cheap gates.** `combatloop`
slid 30/30 → 21/30 unnoticed for weeks because the expensive ones were skipped.

## Perf — PASS, and a cautionary tale

  perf      mean **243.7 fps**, worst 148 (town_garage), floor IQR 0.82 ms — PASS
  gameplay  worst segment streaming-traverse **92.2 fps**, **2 hitches** — PASS

Both `RULER_VALID: true` on a quiet tree. `project/baseline-*.json` are the
origin; later runs go `--baseline` against them.

**These are the third set of numbers called a baseline tonight.** The first was
taken under contention and voided. The second certified 63.1 fps and was wrong by
a factor of five — `ruler.mts` rendered twenty frames in one synchronous task and
throttled itself, giving **correlation 0.107** against the truth with the ranking
*inverted*: the shot it called second-worst was one of the fastest. It had been
written into this file as fact before it was caught.

Attribution on the fixed ruler: held frame 5.4 ms is `post.render` 4.2 (of which
`ScenePass` 3.3) and all game systems 0.9. Cost tracks **draw calls** — ~8.7 us
each, corr 0.801 vs 0.628 for triangles — so triangles and fill are nearly free
and **a new visible `InstancedMesh` costs four draws, not one** (colour plus three
cascades). Per-instance variation is free. Design to that.

## Still weak

Hair and eyes shipped unjudged. `Layers.ts`'s splat reads as one texture, not a
material system. Nothing in our frame ever reaches white — eight of ten reference
plates clip >=0.10%, four of our six clip at exactly 0.00%.

Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata, the world map, the opening cutscene, warp-strike VFX, km-scale terrain
shadow.

## Next, in order

Three lanes were stopped mid-flight at the end of the session. **Their diagnoses
are the deliverable; two of the three shipped code that has never been judged.**

1. **Grounding** — the judge's #1, and now diagnosed. It is structural, not a
   missing mechanism: every grounding term we have is scaled to human dimensions
   and every scenery object in a graded frame is past all of them. GTAO gathers
   at **0.62 m** and fades from 220 m; `ContactShadowPass` marches **0.5 m** and
   range-gates at **55 m**; CSM `maxFar` is **190 m** — while the graded shots'
   nearest visible ground is 61–80 m. A boulder at 400 m gets none of the three.
   `aoBoost` is applied to grass and nothing else. **A measured negative comes
   with it:** a world-metre contact ramp is dead on arrival, because at 61–80 m
   a 1.5 m shrub is eight pixels and 0.34 m of it is one. What FFXV ships is the
   object's own lower body going dark, not a disc on the ground. One untested
   lead: `ContactShadowPass` scales `bias` with distance but leaves `thickness`
   at 0.45, so its accept window is empty past ~140 m. `project/handoff/grounding.md`.
2. **Clouds** — five commits, unjudged. The field was drawn 5x too coarse,
   coverage was applied twice (which made it optically thin), and the march had
   step aliasing the old blur was hiding. Its last WIP commit is *unverified*.
3. **Hair and eyes** — four commits, unjudged, +8 draws and +0.42 M triangles
   unmeasured. Kajiya-Kay was measurably nothing (0.897/255, under the floor) and
   shifted along the strand's own normal, which can only speckle. **The inherited
   "eyes 3/10" was wrong**: with the head hidden the eyeball has radial fibres, a
   real pupil, a limbal ring and a catchlight — the grade was occlusion and
   framing. Open: a skin-coloured wedge covers a third of each aperture.
4. `Layers.ts` — the splat reads as "one texture, not a material system"; six
   layers whose mean lumas span only 0.35–0.47.
5. **Motion.** Every judgment this project has made is on a still frame.
