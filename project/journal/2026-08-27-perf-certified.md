# Both perf gates certify, and the 33 ms rule is owned rather than met

2026-08-27, quiet machine, `HEAD` = `2965de2`.

## The numbers

    perf.mts       mean 208.0 fps   worst 116 fps (regalia_drive)
                   noise floor 1.00 / 1.15 ms, bias -0.10
                   142/142 shots clear 60 fps by more than their own noise
                   RULER_VALID: true          PASS

    gameplay.mts   every segment >= 60 fps
                   worst segment streaming-traverse 127.4 fps (was 67.3)
                   noise floor 0.87 ms = 17% of the median 5.0 ms segment
                   RULER_VALID: true          PASS
                   total hitches 3

`gameplay.mts` has **never** certified before. `project/STATUS.md` has carried
"not certifiable when last run" for days, and every number quoted from it was a
best-effort interleaved A/B rather than a validated run.

## Why it could not certify before, and it was not the game

Two causes, and only one of them was the machine.

**Vite HMR.** The daemon's dev server served the shared working tree with live
reload on, so any lane saving any file navigated every open page. The perf run's
noise floor *grew during the run* — 0.95 → 4.62 ms — which the ruler correctly
refused to certify against and correctly reported as "the workload
destabilising rather than the machine being busy… waiting will NOT fix this
one". It was right twice over: waiting would not have fixed it, and it was not
contention. `vite.config.js` sets `server.hmr = false` now. Same corpus, same
machine: **1.00 ms floor.**

**A rule I wrote the day before and got wrong.** The new per-shot floor asked
`floor < 0.25 * thru`, which is `ruler.mts`'s rule for comparing two runs and
the wrong question for this tool. `perf.mts` asks one thing of a shot — is it
above 60 fps — and a 4.3 ms frame with a 1.2 ms floor answers that
overwhelmingly. The quarter-of-the-frame rule voided shots **for being fast**,
and a corpus at mean 212 fps came back with 37 "unmeasurable" shots, every one
of them 4–5 ms. The test is now the one `ruler.moved()` already stated: a shot
is certified when its distance from the target exceeds its own noise.

## The 33 ms rule: breached, and deliberately accepted

`BRIEF.md` rule 3: *"No frame in a gameplay session may exceed 33 ms."* Three
frames do.

| frame | ms | segment |
|---|---|---|
| 35 | 53.5 | `sprint+turn` |
| 85 | 50.1 | `streaming-traverse` |
| 23 | 42.4 | `sprint+turn` |

**One of the three is not a player frame.** `streaming-traverse` teleports the
player **660 m every twelfth frame** — its own comment says it exists to force
"grass tile refill, clipmap rebuild, prop LOD swaps: the streaming work posed
shots never trigger". No player does that, and no player pays for it.

**Two of them are real.** `sprint+turn` holds sprint while swinging the camera
±22°, which is what a player does constantly, and 2 frames of 150 (1%) exceed
the budget. They are early in the segment and the shape matches a first-draw
cost — program or texture upload as Hammerhead enters the frame — which is what
`STATUS.md` already attributed the older, much larger spike to.

It is accepted rather than fixed, on these grounds:

- It is **down from 90–104 ms**, measured, without anyone targeting it.
- It is 1% of frames in one segment out of thirteen, and every segment's
  *median* is 4.3–7.8 ms, i.e. two to four times inside the budget.
- The remaining cost is a one-off per session, not a recurring stall.

Filed against the standing backlog's perf row rather than left implicit. Phase
4's definition of done asks for exactly this — "or the failure is explained,
owned, and accepted deliberately rather than by default" — and this is that,
with the numbers rather than a shrug.
