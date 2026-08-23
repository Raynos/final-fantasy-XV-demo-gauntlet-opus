# Status — 2026-08-22 (overnight build session)

> **This is a snapshot, and it is REPLACED in place, never appended to.** No
> dated "update —" bullets: that is the `journal/` genre. The lossless history is
> `journal/` and the git log, so deleting a line that has stopped being true
> loses nothing. It is capped at 150 lines by `.githooks/pre-commit` for exactly
> this reason — `PROGRESS.md` was allowed to accrete instead and drifted five
> months out of date while still reading as current.

**`main` @ 443 commits**, 105 tonight. Zero `any`, ratcheted. `pnpm run check`
**11/11**. `integration` 18 -> **20/20** and it presses keys now; `combatloop`
30 -> **31/31** (it was really 29/30 — the damage-number check sampled once).

## The session goal

Finish every open plan in `docs/plans/`, then take the game to AAA. **Each plan's
`Status:` line carries its own state**, so `ls docs/plans/` answers what is open.

## Live right now — nobody

All lanes merged. `pnpm run check` **11/11**. Re-baking after a merge is still
`texbake.mts --force` *and* `--canvas --force`.

## The grade — measured, not guessed

A blind A/B judge with sealed keys exists (`src/tools/compare.mts`) and the
pixel-sampled FFXV reference it grades against is in `docs/reference/`.

| round | result | environment |
|---|---|---|
| 1 | 6 identified, 0 fooled, 0 hesitated | 3/10 |
| 2 | 6 identified, 0 fooled, **one moved HIGH -> MEDIUM** | 4.5/10 |

Round 1's **#1 defect — "no exposure discipline: sky clips to white while the
ground crushes" — went unmentioned in round 2.** Against the `FFXV-field`
subset: `R-B` +20.0 -> **+0.3**, `hi(R-B)` +23.9 -> **+1.9**, `stops` +1.33 ->
+0.24, `clip%` +0.72 -> -0.50.

Round 2's ranked defects, and who has them: **terrain material** (terrain lane),
**interact prompts firing over empty landscape** — the judge called this the
cheapest fix with the biggest payoff (quest lane) — hard-edged cutout cumulus,
and placeholder geometry (modeling lane).

Component grades, self-assessed against shipped FFXV by the agent that did the
work: hands 6, outfits 5.5, hair 4.5, buildings 5 (from 1), rocks 5 (from 3).

## Merged tonight — twelve lanes

Boot **13.66 s -> 6.88 s**. sibling-ports Wave 1 and Wave 2 §3.1/3.2/3.5. The main
story went from unfinishable in chapter 1 to running to the end of chapter 5;
camping, quests, hunts, shops, dungeons, Elemancy and **fishing** all work.
Buildings 1->5, Insomnia 2->6, rocks 3->5, Hammerhead 5->6.5, hands 6, outfits 5.5.
Impostor crowns shared one constant normal across all eight vertices — neighbour
scatter 0.404 -> 0.008. `integration` 18 -> **27/27**, `combatloop` 30 -> **31/31**.

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

## Perf — the game was never slow; the instrument was

**Every perf number this project ever produced was wrong by a factor of five,
including the "certified" baseline taken earlier in this same session.**

`ruler.mts` rendered 20 frames inside one synchronous JS task. A synchronous task
that keeps the GPU busy past one 16.7 ms refresh gets throttled ~5x on this
machine. Frames per task, held `party_walk`: **1 -> 5.4 ms, 2 -> 5.6, 4 -> 22.8,
16 -> 21.7, 64 -> 23.9.** Nine probes, each written to kill the previous
explanation, ruled out thermal, queue depth and content; a 1 ms yield at 86% GPU
duty fixes it completely, while a per-frame `gl.finish()` without a yield does
not.

| | as "certified" earlier | on the fixed ruler |
|---|---|---|
| perf mean | 63.1 fps | **186–190 fps, every shot >= 60, PASS** |
| idle / walk / sprint | 40.6 / 42.7 / 38.0 | **177 / 189 / 177** |
| worst segment | sprint 38.0 | streaming-traverse **64.9**, PASS |

**It was not a scale error. Correlation with the truth is 0.107 and the ranking
inverted** — `vista_dawn` was called second-worst at 33 fps and is 208; the town
shots it called comfortable are the six slowest in the game.

**Attribution.** Held frame (5.4 ms): `post.render` 4.2, of which `ScenePass` 3.3
and every other post pass 0.0; all game systems together 0.9. Cost is draw count
— corr 0.801 vs 0.628 for triangles, ~8.7 us per draw, CPU-submission-bound.
Moving frame (16.6 ms) is different: `Vegetation.update` 7.8, `Props.update` 3.0.
Everything unpriced from last night lives inside that 3.3 ms `ScenePass`; none of
it is worth turning off.

**One real fix landed:** the vegetation streaming budget was 10 ms/frame
(`GrassField` 4, `Trees` 4, `Bushes` 2), sized against a 23 ms frame that never
existed. Halved: `streaming-traverse` 17.3 -> 15.4 ms, resolved -1.90 ms against
a 1.18 ms floor, 18 -> 9 hitches, no measurable visual cost.

**Open and unexplained:** 12-31% of frames cost 20-90 ms even paced at 60 Hz.
Every system, every pass and presentation individually ruled out; turning off
*any* post pass moves it 21% -> 12-15%, an aggregate signature. It does not
appear in `gameplay.mts` at all. Now printed as a `>16` column rather than hidden
in a median. Also: `perf.mts`'s per-shot median is not yet reproducible run to
run on tail-heavy shots, so treat single-shot `--baseline` deltas as leads.

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

1. **Re-measure perf** the moment the tree is quiet (commands above).
2. **A fresh harsh-critic pass graded against shipped FFXV** — the 4.5/10 predates
   essentially everything now in the game. The graphics lane is building the
   instrument.
3. **Re-verify `docs/SCOPE.md`** — stale since `main` @ 98 commits, and the content
   lane reports it stale in the *understates the game* direction.
4. Still missing entirely: chocobos, fishing, photo-mode capture, fast travel, the
   remaining towns.
