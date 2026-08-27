# Status — 2026-08-27

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`.** Zero `any`, both typechecks clean, **`pnpm run check` 18/18**, and
**both perf gates certify** — `gameplay.mts` for the first time ever.

## Phase 4 is DONE, 5 of 5, and graduated

`2026-08-22-opus-phase4-content-and-gameplay` — the last phase of the four-phase
sequence it absorbed — is in `project/archive/plans/`. Its §5 carries the
evidence per box; this is the shape of it.

    perf      mean 208.0 fps, worst 116 (regalia_drive), 142/142 shots clear
              the 60 fps target by more than their own noise, RULER_VALID true
    gameplay  every segment >= 60 fps, worst 127.4 (streaming-traverse, from
              67.3), 3 hitches, RULER_VALID true — it had NEVER certified before
    check     18/18 (the suite grew 17 -> 18: `drawcheck` is new)
    loop      one den pays 66 EXP / 2 AP / 84 gil / 4 drops; the AP buys a real
              Ascension node; the identical swing goes 249 -> 254
    session   27-28 unbroken minutes across two lanes, ~10 km, 21-22 encounters
              all resolved, 77-81 forage, every menu still answering, zero page
              errors, flat heap — and EVERY ending in eight runs was the
              harness closing the page, never the game
    critic    round 16, blind: 19 of 20 identified, and the FIRST non-zero
              hesitation in five rounds

**The 33 ms rule is breached by 3 frames and is owned, not met.** One of them is
a 660 m teleport `streaming-traverse` performs on purpose and no player pays
for; the other two are 1% of one segment, down from 90-104 ms. Grounds in
`journal/2026-08-27-perf-certified.md`.

## The world was barren, and this is what it actually was

The human played the build and said so. Four separate causes, each measured:

| | before | after |
|---|---|---|
| anything alive within 120 m of a walk | 32% of samples | **63%** |
| worst gap between events | 325 m | **75 m** |
| an E prompt available over 3 km | **0%** | a spot every 66-190 m |
| non-grass scenery past 400 m | 8.6-12.9/ha | a mass ring to 2.6 km |

- **The world ended at 440 m.** `probes/barrencensus.mts` counts instances by
  distance: 90-290 per hectare inside 400 m, then a cliff. Scrub got a far mass
  ring, built as a copy of `Trees`' canopy ring.
- **18 hand-placed territories on a 67 km² map** — 0.08% of it had an encounter
  in it. `WildTerritories` generates dens from the cell hash. Density is a
  **swept-corridor** number, not a per-area one; the first tuning reasoned
  per-area and measured as *no change at all*.
- **Nothing in the open world could be picked up**, while the HUD's own boot
  objective read "Collect Rusted Bits from the wastes". `Foraging` scatters them
  by the ground they lie on, in two draw calls.
- **A 4-30 m hole in the terrain's cover octaves.** 0.74/1.9 m are gone by 300 m
  and 52/165 m do not resolve below 800 m, so every hillside at 150-400 m — the
  bottom third of every establishing shot — was one flat hue.

## Four things were authored, documented, and never read by any code

Found by playing, not by reading, and invisible to every gate because nothing
was *broken*:

- **`Territory.passive`** — "a grazing herd: it is scenery until something
  provokes it", since the spawn tables were written. Every dualhorn charged on
  sight.
- **`Enemy.level`** — carried, printed, written by every table, read by the EXP
  formula, scaling nothing. A level-7 and a level-45 sabertusk were identical.
- **`CameraRig.setLockOn`** — a full combat-framing block nothing called.
- **`game.currentShot`** — never cleared on going live, which killed the
  Regalia's entire input path for the life of any page that had posed a shot.

Also: the party could not catch up after a fight (cap 8.29 m/s against a 7.4 m/s
sprint — enough to hold a slot, never to close a gap), and warp-strike did
**62-77% of all damage in every fight**.

## The instruments are the durable half

Six did not exist yesterday and each answers a question no held frame can.
`walkabout` (what a player MEETS over kilometres) · `longplay` (one continuous
session, thirteen dead-end checks) · `loopclose` (fight -> reward -> spend ->
fight better) · `fightshape` (does a fight have shape) · `barrencensus`
(instances by distance) · `drawcheck` (the gate for a budget nothing had read).

**Their own bugs are recorded in their headers, because each is a trap for the
next reader.** A posed page boots with the encounter loop OFF; `keyDown` reads
the per-frame EDGE set, not the held one; `CameraRig.yaw` is the camera's orbit
angle, so W walks `-(sin, cos)`; EXP is **banked**, not applied; grazing beasts
key on `ax/az`.

## The harness, and three ways it kills a long run

- **Vite HMR was a fault injector.** The `dirty:` build serves the shared tree,
  so any lane's save navigated every open page and killed whatever was
  mid-`page.evaluate`. It read as a crash. `hmr: false` now — **and only that**:
  the first fix also ignored the watcher, which left a long-lived server on its
  startup module graph forever, so edits measured as *exactly zero*.
- **`pnpm dev` is gone.** Nobody starts a server; `daemon.mts` owns every one.
- A long probe needs **`--ttl <minutes>`** or the lease closes its page at
  fifteen; **do not commit while one runs** (trees are pruned at ten and it will
  drop the one being served); and **do not run `perf`/`gameplay` beside one** —
  the quiet lane calls `pool.closeAll()`, which closes leased contexts too.

## Draw calls: 1013 -> 801, and one shot in 142 is over

`drawcheck` gates it, parses the budget out of `BRIEF.md` rather than copying
it, and ratchets `project/draw-baseline.json` so a recorded shot can only fall.
`town_forecourt` reads 801-821 across runs — a spread wider than the ratchet's
tolerance — against 800. Everything else is at or under; corpus median 587.
What clears it is named in the backlog's WS-6.

**A held pose does not draw a constant number of calls**: `poi_reststop` goes
707 / 855 / 707 / 1005 as three shadow cascades refresh on a rotating schedule.
The capture lands on a fixed phase, so it is comparable and it is the expensive
phase.

## Still weak, and who owns it

Round 16's ranked tells, verified rather than asserted: **faces first** — no
subsurface, skin detail so coarse that pores read as scratches, hair as opaque
shards; the silhouettes are fine and it is entirely shading. Then **clouds**
(organisation, not shading — they are a real raymarch, and round 15's
"cotton-wool sprites" diagnosis was wrong and is corrected in place), then **no
sky fill in shadow**, then **no foreground occluder in any establishing shot**.

`Layers.ts`'s splat still reads as one texture. **A page costs ~1.94 GB of RSS.**
`RpgSystem.enemyScaling` is documented as reading the party's level and does not.
There is terrain where holding forward yields zero progress with no slide-off.

## Next

`docs/plans/2026-08-25-opus-after-phase3.md` (WS-1 the head — worth 3.0 -> 4.0
on its own costing, more than everything else combined) and
`docs/plans/2026-08-26-opus-the-standing-backlog.md`, whose table of **measured
negatives** lists ten claims not worth re-opening.

**After any merge: `build:full`**, not `build` — `build` deletes the
painted-face cache without replacing it and cold boot regresses ~2.5 s.
