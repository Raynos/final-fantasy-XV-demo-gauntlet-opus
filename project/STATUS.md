# Status — 2026-08-27

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`.** Zero `any`, both typechecks clean, **`pnpm run check` 18/18**, and
**both perf gates certify** — `gameplay.mts` for the first time ever.

**Live lanes:** `benchmaxx` (opus) owns
`docs/plans/2026-08-24-opus-benchmaxx-harness.md`, IN-PROGRESS — every phase has
shipped and its definition of done is weekly, so it closes on a week of ledger
rather than on a diff. See `project/handoff/benchmaxx.md`.

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

## The world was barren, and four systems were never read by any code

Both found by *playing*, not by reading, and both invisible to every gate
because nothing was broken. The measurements are in
`journal/2026-08-27-perf-certified.md` and the archived phase-4 plan's §5; the
shape, so nobody re-derives it:

- **The world ended at 440 m** (instance density fell off a cliff past 400 m),
  **18 hand-placed territories covered 0.08% of a 67 km² map**, **nothing in the
  open world could be picked up** while the boot objective said to collect it,
  and a **4-30 m hole in the terrain's cover octaves** left every hillside at
  150-400 m one flat hue. Anything alive within 120 m of a walk went 32% -> 63%
  of samples; the worst gap between events 325 m -> 75 m.
- **`Territory.passive`, `Enemy.level`, `CameraRig.setLockOn` and
  `game.currentShot`** were each authored, documented and dead. Density is a
  **swept-corridor** number, not a per-area one — the first tuning reasoned
  per-area and measured as *no change at all*.

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

## The harness measures itself now, and it got much faster

`docs/plans/2026-08-24-opus-benchmaxx-harness.md` is implemented A-F;
`project/handoff/benchmaxx.md` has the per-phase evidence. What changed, in
numbers:

| | before | after |
|---|---|---|
| `pnpm run check`, cold, quiet | ~780 s serial | **272.9 s**, 18/18, two pools |
| `pnpm run check`, tree already graded | ~780 s | **0.68 s** |
| `drawcheck` (the old critical path) | 269 s | **120 s** alone (`--par 4`), 0.18 s memoised |
| pre-commit | 1.59 s | **1.04 s**, three jobs at once |
| 30-game-minute `longplay` | ~22 wall-min | **~3**, `--turbo 10`, telemetry identical |
| "why was that slow?" | 2 h of transcript archaeology | `harnessstats.mts`, one command |

**The daemon writes a ledger** (`~/.cache/ffxv-harness/<key>/jobs.jsonl`) and
every response carries `queuedMs`/`ranMs`, so a slow call names its own reason in
the transcript. `daemon.mts --wait quiet|exclusive-free|idle` replaces polling
and a hook now blocks the loops. `gitlock.mts` gives git's index lock the queue
it never had. `post-commit` prewarms the sha you just made.

**A stepped frame is 95% draw submission** — 11.0 ms of 11.66, against a 0.16 ms
A/B/A drift, with the simulation at 0.58 ms (`probes/turbocost.mts`). That, not
the sim, was always what a long probe paid for.

Still true, and still the way to kill a long run: a long probe needs
**`--ttl <minutes>`** or the lease closes its page at fifteen, and **committing
during one** can drop the tree it is served from (trees are pruned at ten).
**`perf`/`gameplay` no longer kill it** — `/exclusive` queues behind a live lease
now, bounded by its TTL. Vite HMR is still off and `pnpm dev` still gone: the
`dirty:` build serves the shared tree, so any lane's save navigated every open
page and killed whatever was mid-`page.evaluate`, which read as a crash.

**A page costs 2 449 MB of chromium RSS, and four cost 16 465 MB** — `ps` over
the process tree, so shared pages are counted per process; it is a trendline on
one machine, not an absolute. `TODO.md` says 1.4 GB and this file used to say
1.94; neither was attached to a repeatable measurement, and now one is, on every
ledger line.

## Draw calls: 1013 -> 786, and nothing is over budget

`drawcheck` gates it, parses the budget out of `BRIEF.md` rather than copying
it, and ratchets `project/draw-baseline.json` so a recorded shot can only fall.
`town_forecourt`, the last entry in that ledger, now reads **786 against 800** —
it has cleared the budget outright, but its spread across runs is wider than the
ratchet's tolerance, so confirm across two runs before deleting the entry.
Corpus median 567, worst 786.

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

`Layers.ts`'s splat still reads as one texture. `RpgSystem.enemyScaling` is
documented as reading the party's level and does not. There is terrain where
holding forward yields zero progress with no slide-off. Cold boot is ~6.6 s with
every cache warm and the game-side diet is `after-phase3`'s WS-2 (shader
programs, 1.83 s) and WS-3 (geometry bake, ~950 ms), not the harness lane's.

## Next

`docs/plans/2026-08-25-opus-after-phase3.md` (WS-1 the head — worth 3.0 -> 4.0
on its own costing, more than everything else combined) and
`docs/plans/2026-08-26-opus-the-standing-backlog.md`, whose table of **measured
negatives** lists ten claims not worth re-opening.

**After any merge: `build:full`**, not `build` — `build` deletes the
painted-face cache without replacing it and cold boot regresses ~2.5 s.
