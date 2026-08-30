# Status — 2026-08-31, mid-build

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`. One plan, LOCKED and being built: `docs/plans/2026-08-30-fable-to-nine.md`.**
The overnight autonomous build is running now, coordinated from
`project/handoff/2026-08-30-coordinator.md` — read that first for the six human
decisions taken at dispatch. MEGA BUILD MODE: no judging until every lane lands.

## What is live

Eight lanes at a time on the shared trunk. **Closed so far:** 4 (clouds),
10 (input truth), 13 (memory and boot), 5+6 (light in shadow, hue), 1 (rig —
respawned to finish). **Live:** 1-respawn, 3, 7, 15, 16, 17, 18, 19, 22.
**Not yet staffed:** 2, 11, 12, 14, 20, 21, 23.

Per-lane state is in `project/handoff/<lane>.md`; the directory length is the
live headcount.

## The gate that is red, and why it is interesting

**`driftcheck` FAILS and it is not drift.** `SURFACE DRIFT mean 0.000 m, worst
0.000 m over 36 864 texels` — the before and after probes are identical. What
fails is a *static* disagreement between the rendered ground and
`Terrain.heightAt()`: **mean −0.001 m, p99 0.229 m, and one texel in 36 864 at
−0.520 m** at (−39.8, −68.2), 16% past a `tolCpu` of 0.45 that was fitted to a
measured ~0.37 m chord sag. The sign is always negative, which is the only sign
a tessellation chord can have.

It was PASS at the dispatch baseline and `check` invokes it with no extra
arguments, so this is not the invocation-path landmine. **`--build` cannot
bisect it**: `--build` *is* honoured (verified — it announces the right tree
sha), but `src/public/baked/` is a shared cache symlinked into every
materialised tree, so an old sha runs against tonight's bake, and `--build
7da60d5` and `--build HEAD` return bit-identical numbers in every digit. Lane 16
owns the repair; the proposal on the table is to gate p99 and *report* the worst
texel, falsified against the tool's own `tfH += 3.0` control arm.

Everything else was green at dispatch (19/19) and `nanscan` reads 0 of 142.
Draw calls 436–616 against a budget of 800.

## No number taken tonight is a baseline

Eight lanes each running the 19-gate suite put **36% of all harness time into a
queue rather than into work** — 25 concurrent `check.mts` against a daemon
worker budget of 4. The full suite now belongs to the coordinator alone and the
lanes run only the gates they own. Every perf and memory arm printed `CONTENDED
throughout`; the same build read 1 211 and 1 280 MB five minutes apart.
`geo.bin.gz` and `texc.bin.gz` were absent for hours, pruned repeatedly by
co-agents' `pre-commit` `vite build`. **Re-measure everything on a quiet tree
with the caches rebuilt before believing it.**

## What has actually moved

- **The winding was wrong at the root, and it is fixed and proved.** Not
  per-mesh: `Geo.ts`'s ring frame is right-handed while the ring runs clockwise
  in it, so every `sweepTube`, both dome caps, `sweepShell`, `blob`,
  `roundedBox`, both eye globes and the hair scalp were inward. Skin is
  `FrontSide`, so what drew was the *far* side with mirrored normals. All four
  heroes now read positive signed volume on every primitive.
- **Clouds gained a stop of internal range** — cStops 1.49 → 1.95, clip 19.2% →
  6.6%, the top-edge crossing 8 → 6 px, coverage cells 10 → 51.
- **Sky fill in shadow landed**: `zone_vannath`'s shadowed foreground p50 luma
  7 → 22, the plan's gate box 35 → 61 against a bar of 30.
- **The controls card no longer lies** — 5 wrong combat rows, 3 bad pairs in
  `Prompts.ts`, and a pad column where 17 of 44 rows had no binding at all.
- **A gate now asserts which way the car turns**, and falsifies itself against
  the shipped bug.

## The premises that were wrong again

Five more this session, which is the running theme of this project:

- **Lane 13's exit was priced against the wrong number.** The tab is 1 382 MB,
  not the plan's 1 246, and everything tasks 38–41 name is worth ~15 MB against
  a 582 MB gap. The lane landed ~33 MB across CPU and GPU and closed with a
  measured negative. The real levers are in `TASKS.md`.
- **`aClip` is a position attribute wearing a shading attribute's name** — it is
  the clipmap's LOD morph alpha, spent directly on vertex height.
- **A post-hoc attribute re-pack deleted an NPC's shadow**, silently, because
  `MIN_VERTS` guards the wrong axis for a character.
- **`uxcheck` exempted the Regalia under a claim that was not true of the code**,
  and `Math.abs` in `regaliadrive` was an exemption wearing a tolerance's
  clothes. Between them a mirrored car shipped.
- **Task 6 was never a `brushes()` job**, and `Props.landmarks` → `bakedParts`
  was never "a five-line addition" — a cache hit ships havens with no fire.

## Knowingly unfinished

- **`facecheck` still prints 2 VOID and PASSes.** Plan task 47 makes that a
  failure and is deliberately held until both heads clear, so the shared trunk
  never goes red for seven lanes. Noctis's VOID is a hair-shadow edge, i.e.
  task 4.
- **The eyes read googly on all four heroes** — a defect the winding fix
  *exposed*, because no lane has ever seen the real sclera before tonight. It is
  the loudest thing on a closeup, and the head is the judge's #1 tell.
- **`SKIN_CLEARANCE = 0.030` inflates every garment by 30 mm**, absorbing a
  `drape()` bug rather than fixing it. In `HUMAN_REVIEW.md`.
- **The public-URL deploy is descoped** by human decision; it is the human's,
  not a lane's.
