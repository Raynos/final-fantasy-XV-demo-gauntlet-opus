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

Finish every open plan in `docs/plans/`, then take the game to AAA. **Each plan's
`Status:` line carries its own state**, so `ls docs/plans/` answers what is open.

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

Two patterns, both worth more than any fix in it.

**Six systems were declared, documented, referenced in handoffs — and never
executed.** `Animator.rest`, the subsurface skin model (a measured no-op at
0.150/255), `BossFight.resolveStrike`, three whole LOD tiers flagged not to cast
while 1,239 of them filled the frame, three's one-sided alpha ramp, and `gully`,
which had never displaced a vertex anywhere. `orphans` passed all six: it proves
a module is *reachable*, not that it *runs*. **`reachcheck.mts` now closes that**
— it instruments 1,877 methods with no annotations, drives the game with real key
events, and gates on `project/must-run.json`. Verified by breaking a registration
on purpose.

**Five instruments were measuring themselves**: a stale texel cache with no
symptom, a gate runner reporting a terrain regression when the gate never ran,
capture tools that would silently photograph another worktree, a boot profile
with no contention guard (6.88 s quiet, 17.05 s loaded), and the perf ruler.
The rule that came out of it, and it is now standing practice: **before trusting
a number, make the instrument report on a case whose answer you already know.**

Narrative account: `project/journal/2026-08-22-985c9fe3.md`.

## Determinism — CLOSED, at the noise floor

A shot alone versus sixth in a batch: **1.836 -> 0.340 mean/255** against a
measured floor of 0.302. The cause was the **wind**, not the vegetation
streaming every handoff had guessed. Account in `417ca86`; lesson in
`LANDMINES.md`.

## Where the truth is

- `BRIEF.md` — the contract. Art direction, engine contracts, definition of done.
- `project/HANDOFF.md` — the method, the tooling, the architecture.
- `project/LANDMINES.md` — what will bite you, and the diagnoses that were
  confidently wrong. Read the last section twice.
- `docs/SCOPE.md` — the atomic inventory. **Stale: last verified against `main`
  @ 98 commits (2026-08-17), 243 commits ago.** Re-verifying it is open work.
- `project/README.md` — which document is which genre.

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

## Still weak, and who has it

Hair still reads as quills. `Bushes.ts` (491 lines) has never been audited.
`MapScreen` is a 22-line stub. `anak` needs a sculpt rather than paint. Nothing
in our frame ever reaches white — eight of ten reference plates clip >=0.10%,
four of our six clip at exactly 0.00% — and the fix is internal dynamic range in
the cloud, not exposure.

Genuinely strong: the field HUD, atmosphere and aerial perspective (measured on
the reference now), terrain strata and silhouette, the world map, the opening
cutscene, warp-strike VFX, and km-scale terrain shadow.

## Next, in order

1. **Cloud billboards** and **terrain triangulation** — named by four consecutive
   judges, nobody assigned to either. Both are in the round-10 write-up.
2. **A floating rock arch**, round 10, twice, cheap. `project/handoff/landmarks.md`
   open item 0.
3. **Hair**, then **eyes** (3/10, gradeable for the first time now `hero_portrait`
   shows a face).
4. **Motion.** Every judgment this project has ever made is on a still frame. The
   game only became playable end-to-end tonight and nobody has watched it move.
5. Extend `reachcheck`'s exercise to land a set-piece strike, so
   `EncounterDirector.resolveStrike` can join `must-run.json`.
