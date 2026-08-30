# Status — 2026-08-31, mid-build

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`. One plan, LOCKED and being built: `docs/plans/2026-08-30-fable-to-nine.md`.**
The overnight autonomous build is running now, coordinated from
`project/handoff/2026-08-30-coordinator.md` — read that first for the six human
decisions taken at dispatch. MEGA BUILD MODE: no judging until every lane lands.

## What is live

Ten lanes at a time on the shared trunk. **Closed:** 3 (near-field), 4 (clouds),
5+6 (light in shadow, hue), 7 (water and weather), 10 (input truth), 13 (memory
and boot), 15 (postfx), 17 (spine and dungeons), 19 (city hubs). **Live:** 1, 2,
11, 14, 16, 18, 20, 21, 22, 23. **Held by design:** 12, which is the playtest's
own queue and cannot be staffed until R2 reports.

Per-lane state is in `project/handoff/<lane>.md`; the directory length is the
live headcount.

## The gate that was red, and what it turned out to be

**`driftcheck` is green, and the diagnosis is worth more than the fix.** It was
never drift: the before and after probes were identical (`mean 0.000, worst
0.000 over 36 864 texels`). What failed was a *static* disagreement between the
rendered ground and `Terrain.heightAt()` — and the error histogram is
**symmetric**, `1 38 493 2836 5838 2809 499 28 2`, which is tessellation chord
error shown rather than argued, and is what an offset provably cannot produce.

The gate now tests **both** the flat tolerance **and** each texel against its own
local sag bound, and it is **falsified**: `--inject 'tfH += 3.0;'` moves
12 544 of 12 544 texels into violation against 0 at baseline, with the control's
histogram being the baseline's shifted by exactly +3.0 in every bin. `--sag-k 0`
restores the old flat predicate in one flag.

**And the gate was partly reading a stale bake.** On fresh caches the worst error
moved −0.520 → −0.397 — which at the old predicate would have passed by 12%. So
the instrument that first reported the problem had itself been bitten by the
shared-bake trap below. That is the argument *for* the repair, not against it:
the gate was one gully lip from red either way.

Everything else was green at dispatch (19/19) and `nanscan` reads 0 of 142.
Draw calls 436–616 against a budget of 800.

## The two harness faults that cost the most

**The prewarm queue was unbounded.** `daemon.mts`'s `prewarm()` docstring
promised "newest sha wins — a second commit supersedes the first rather than
queueing two boots"; the code only ever rejected a duplicate of the *same* sha.
Ten lanes plus a `post-commit` hook per commit outran four workers: **62% of all
harness time was queue**, p50 prewarm wait 8.4 min, worst 33.1, daemon RSS
10.2 GB. It presented as unrelated failures everywhere — 300 s `preparePage`
timeouts, ablations timing out, three lanes reporting a `check` that never
returned. Fixed; the daemon was restarted to discard 62 stale prewarms.

**`--build <sha>` is not a bisect here.** `src/public/baked/` is one directory
symlinked into every materialised tree, so a `--build` run re-bakes those shared
artifacts from that sha's sources — every lane captures against whichever sha was
materialised last. `bakecheck` caught three different shas in one capture. This
retroactively explains two builds returning bit-identical numbers, one sha
giving PASS then FAIL, and a lane's "big win" that was another lane's in-flight
edit.

**`texc.bin.gz` and `geo.bin.gz` cannot stay fresh while lanes commit** — any
`pre-commit` `vite build` deletes them. MISSING is the safe state (regenerated
at runtime, ~3.7 s slower); **STALE is the dangerous one**, silently rendering
faces a version behind their sculpt. Rebake immediately before any judged or
certified number, with commits held.

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
