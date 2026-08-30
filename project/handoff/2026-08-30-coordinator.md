# Coordinator — the fable-to-nine overnight build

Live. Started 2026-08-30 from `c338443` on `main`, driving
`docs/plans/2026-08-30-fable-to-nine.md` (LOCKED) to its Definition of Done.
The human is asleep; this session runs the build autonomously and reports in
the morning.

## Human decisions taken at dispatch (recorded — these override the plan text)

1. **R1 + agent-playtest proxy.** After every lane lands, run judge round 17
   (`compare.mts`, 20 pairs, shuffled control arm, the five new city PAIRING
   rows) and iterate §4's fix-waves to 9-or-plateau. For R2, drive a scripted
   30-minute no-instruction session and have a fresh agent play and rank what
   felt broken, feeding lane 12. The human's own playtest is a **confirmation
   pass in the morning, not a blocker**; the plan may archive with
   "R2-human" as the single open item.
2. **The public-URL deploy bullet is descoped** — the human's, not a lane's.
   Everything else in the DoD stands.
3. **8 concurrent lanes**, §5's wave composition.
4. **Push to `origin/main` periodically** (coordinator only; `pre-push` runs
   `check:gate`, so a red tree cannot leave the machine).
5. **A stalled lane closes with a measured negative** (plan rule 2) rather
   than grinding.
6. **Lane 20 (the Meteor) is NOT cut.** The human declined §5's overrun cut —
   it ships even if the night runs long.

## Baseline, verified 2026-08-30 before dispatch

`pnpm run check` **19/19** on tree `e55e01cf68b1`, quiet, 45.0 s (6 cached).
`facecheck` PASS while printing *"2 head(s) VOID on the pixel rows"* — that is
plan task 47's bug, live, in the baseline.

## The contract every lane was given

`tmp/LANE_CONTRACT.md` (gitignored, regenerate from this file's history if
lost): read order, MEGA BUILD MODE, disjoint ownership, explicit-pathspec
commits through `gitlock.mts`, the daemon rules, look-at-your-own-output, the
handoff requirement, the ~3 h/150-turn stop, and the report format.

## Serialization the lane split cannot express

- **`src/game/Shots.ts`** — lane 3 holds it through wave 1; lane 21 takes it
  only after lane 3 re-baselines and reports release.
- **`Quests.ts`** — lane 17 owns it first. Lanes 18 and 19 build everything
  else, then land quest rows after 17's spine commits, or hand rows to 17.
- **`PoiKits.ts`** — lane 19's H2 town-anchor export is an early small commit;
  lane 18's sector kits go after it.
- **Task 47 (`facecheck` VOID → failure)** is lane 16's row but gates lane 1's
  exit. **Delegated to lane 1**, to land in the *same commit* as its winding
  fix so the shared trunk never goes red. Lane 16 is told not to do it.
- **Lanes 5 and 6 share one cold-start brief** and are staffed as one agent.

## Wave plan

- **Wave 1:** 1 (rig/), 3 (veg + Shots.ts), 4 (sky), 5+6 (terrain + palettes),
  10 (ui + vehicle), 13 (engine), 17 (game/rpg + dungeons + map screen),
  19 (town + Shops + Npcs).
- **Wave 2:** 2 (costume), 7 (water/weather), 11 (fight shape), 14 (first
  load), 15 (postfx + grain), 16 (gates), 18 (sectors), 22 (chocobo — started
  early, it is 3–4 lifetimes).
- **Wave 3:** 20 (Meteor), 21 (content shots), 23 (swimming + diving), plus
  respawns.
- **Then:** R1 judge round 17 → §4 fix waves; R2 agent playtest → lane 12.

## Status

Wave 1 dispatched. See the per-lane files beside this one.

## Watch list for the R1 judged round (round 17)

Things a lane measured but could not settle alone, which the judged round is the
right instrument for. **Rank these deliberately; do not let them ride.**

- **`party_walk` may have got worse.** Lane 3 fixed a sign error in
  `GrassField._update`'s near test (`dist < near - T*0.75` on tile centres was
  21-18 = 3 m on a 24 m tile), which means the whole world had been tuned with
  grass cards drawing from zero. Isolated against an ablation tree with only
  `GrassField.ts` reverted: `hero_full` is plainly better, but **`party_walk`
  moves 9.517/255 over 22.2% of pixels against a 1.51 floor** and loses the
  tussocks around the party's boots. Blades cannot cover the gap
  (`--hide grass_blade` is 1.075 at HEAD) and raising the caster gate is a
  recorded negative. **If `party_walk` loses in the round, the answer is a
  near-LOD geometry change, not a density tweak.**
- **Task 13 (foreground occluders) is one third done** — `vista_dawn` has one,
  the rest need `Shots.ts`, which lane 3 released to lane 21. The one frame that
  ever made the judge stall is the one that has an occluder; this is the
  cheapest lever in the judged set and it is unfinished.
- **The city plaza/apron is a flat untextured plane** in every Lestallum and
  Galdin frame (`PoiKits` `M.concrete`/`M.gravel`, handed to lane 18). Fourteen
  of lane 21's shots are city frames and five join PAIRING.
- **The eyes read googly on all four heroes**, a defect the winding fix exposed
  rather than caused. The head is the judge's #1 ranked tell.

## Cache hygiene before any judged or certified number

`pnpm run build` **deletes** the painted-face cache without replacing it, and
every lane's `pre-commit` runs it — so `geo.bin.gz` and `texc.bin.gz` were
absent for hours tonight. **`pnpm run build:full` is what makes them.** Run it,
then verify, immediately before R1 and before any final perf, memory or
cold-load number. A capture taken with two of six artifacts missing is not the
game.

