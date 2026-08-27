# Thirty minutes of continuous play, and the fifteen-minute ceiling that stops it

2026-08-27, opus. Instrument: `src/tools/probes/longplay.mts`.
Builds: `5fabd4b` (baseline attempts) through `00cefee` (`--prod`).

Phase 4's definition of done opens with *"a person can play for 30 minutes
without hitting a dead end or a stub"*, and
`docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md` §5 records that **no
document in this repo has ever recorded anyone playing this game for thirty
minutes.** This is the first attempt to close that. It does not close it, and
the reason is worth more than the attempt was.

**The headline, in one line: the game survived 28 unbroken minutes with zero
page errors and no verb refusing, and not one of the runs below ended because of
the game.** Every death was the harness.

## What the game did

The longest surviving session — `--prod`, 30 requested, ended by the harness at
game minute 28:

    game minute  4/30 —  1.7 min wall,  1.41 km,  3 encounters, 14 forage
    game minute  8/30 —  3.9 min wall,  2.87 km,  5 encounters, 24 forage
    game minute 12/30 —  6.1 min wall,  4.33 km,  8 encounters, 36 forage
    game minute 16/30 —  7.9 min wall,  5.67 km,  9 encounters, 46 forage
    game minute 20/30 — 10.0 min wall,  7.13 km, 12 encounters, 58 forage
    game minute 24/30 — 12.4 min wall,  8.55 km, 18 encounters, 66 forage
    game minute 28/30 — 14.9 min wall, 10.00 km, 22 encounters, 81 forage

Read the slopes, because the slopes are the whole answer to "does it run out".
Across 28 minutes the world produced **0.36 km of travel, 0.79 encounters and
2.9 forage pickups per minute**, and all three are as steep in the last four
minutes as in the first four. Nothing tails off. The JS heap is **793 MB, flat
to the megabyte on all thirty samples** — no leak.

## Every check, and its verdict

The only run that has ever reached the check block is the pre-fix 30-minute run,
and **its verdicts should not be quoted** — see the next section for why. Both
sets are given here because the contrast is the finding.

| check | 30 min, pre-fix (invalid) | 6 min, post-fix (valid) |
|---|---|---|
| no page errors | ok | ok |
| the world keeps producing fights | ok — 18 in 30 min = 0.60/min | ok — 4 in 6 min = 0.67/min |
| fights end | ok — director state `field` | ok — `field` |
| no fight ran away with the session | ok — longest 6 s | ok — longest 5 s |
| the world keeps producing things to pick up | **FAIL — 11 = 0.37/min** | ok — 19 = 3.17/min |
| rewards accumulated | ok — exp +13 699, gil +5 072 | ok — exp +2 151, gil +1 648 |
| the player is still on the ground | ok — (-405, -253) | ok — (-1035, -20) |
| the party is still with him | ok — 2 m 3 m 3 m | ok — 2 m 3 m 3 m |
| the quest log still has work in it | ok — 3 active (started 4) | ok — 3 active (started 4) |
| menus still open | ok | ok |
| the map still opens | ok | ok |
| camping still works | ok | ok |
| the shop still sells | ok | ok |

**12 of 13, then 13 of 13.** The single FAIL was the probe, not the game, and it
is fixed.

## The FAIL was the probe walking into a hill

The pre-fix 30-minute run reported `the world keeps producing things to pick up
— 11 taken = 0.37/min`, against a threshold of 0.4/min. That result was
worthless, and so were the twelve passes beside it, because the session was not
thirty minutes of play: it was **three minutes of play and twenty-seven minutes
of a character standing still.**

A diagnostic run logging position every 300 frames says where. At game minute
2.8 the route reached **(-405, 53, -254)** — the top of a climb that took `y`
from 10 to 62 in fifteen seconds — and stopped. From there to the end the
position is pinned to the metre, `grounded` stays true, `enc.state` cycles
field/combat normally, and the distance to the nearest un-taken forage spot
sits at **52.9 m and never once decreases.** The probe held `KeyW` into a slope
it could not climb for 27 minutes.

Two headline numbers were artefacts of that, not observations:

- **3.38 km travelled against 478 m of net displacement.** Grinding on a hill
  accumulates `travelled` at a dead-constant 1.4 m/s — which is why the
  heartbeat read a suspiciously exact 0.085 km every minute from minute 4 on.
- **"The world stops producing things to pick up."** It did not.
  `Foraging.live` is rebuilt every frame, sorted nearest-first, and already
  excludes `taken`; it held **23 live spots the whole time.** Nothing stopped
  producing. The player stopped arriving.

The fix is what a person does — give up and walk somewhere else. A spot whose
distance has not improved by a metre in 900 frames goes into an `abandoned` set
(without the set it re-locks onto the same berry next tick), and independently,
under 8 m of movement in 600 frames while not in combat turns the yaw 2.2 rad.
Same build, same seed: **gave up on 1 spot, turned away once**, then kept going
— 2.14 km instead of 1.31 km by minute 6, 19 forage instead of 11 for the entire
session, 13/13.

**This is the one genuine gameplay observation in the whole exercise**, and it is
about the probe rather than the game only in the sense that a human would have
turned around: there is terrain near (-405, 53, -254) where holding forward
produces zero progress indefinitely, with no slide-off and no unstick. Worth a
look by whoever owns traversal; it is not a dead end for a player who steers.

## Why there is still no completed 30-minute run

**A leased page is destroyed after fifteen minutes of wall clock, and 30 game
minutes costs about sixteen.**

`daemon.mts routeLease` defaults `ttlMs = 15 * 60_000` and `harness.lease()`
never overrides it, so the daemon calls `releaseLease` — which closes the page —
out from under whatever is mid-`page.evaluate`. It arrives as
`page.evaluate: Target page, context or browser has been closed`, which reads
like a crash and is not one.

Five runs died there, and the arithmetic is the same every time:

| build / viewport | reached | wall clock | wall min per game min |
|---|---|---|---|
| dev 1600×900 | minute 24 | 14.9 | 0.62 |
| dev 800×450 | minute 25 | 14.8 | 0.59 |
| dev 640×360 | minute 25 | 14.6 | 0.58 |
| dev 800×450 | minute 27 | 14.5 | 0.54 |
| **prod 800×450** | **minute 28** | **14.9** | **0.53** |

`g.frame()` renders, so a game minute costs real GPU and CPU time. Thirty of
them need a sustained **120 sim fps**; this machine, shared with three other
lanes at load 4–6, delivers 110–118. On a quiet machine it fits — the 6-minute
validation ran at **145 fps (0.41 wall min per game min, 12.3 min projected for
30)** — but the shared trunk is never quiet for sixteen consecutive minutes.
An eighth attempt, started at 17:16 under load 6, was running at 0.87 wall min
per game min — half speed — and was abandoned at minute 11.

Two levers were tried and neither is one. **Viewport is not the bottleneck**:
640×360 is no faster than 800×450, so this is CPU-bound, not fill-rate-bound.
**`--q` does nothing at all** — `main.ts` never reads it; it exists only as a
daemon page-cache key. `--prod` bought a percent or two, which was not enough.

**The one-line fix is not in a file this lane owns.** `probe.mts` calls
`lease(pageOpts(ha))`, and `pageOpts` does not carry `ttlMs` — but `routeLease`
already accepts it from the request body. A `ttlMs` on that lease (or a
`--ttl` flag threaded through `harnessArgs`) removes the ceiling entirely.
**That is the next step for this box, and it is a harness change, not a game
change.**

## Two other ways a shared harness ends a long run

Both cost this lane a run before being understood, and both are now in the
probe's header:

- **`perf.mts` / `gameplay.mts` will kill it.** `withExclusive` posts
  `/exclusive`; the daemon answers with `pool.closeAll()`, which closes every
  browser context including one a lease is holding. `takeExclusive` drains
  `busyWorkers`, and a lease is not a worker job, so it is never waited for.
  Measured: a 4-minute run died at **93 s** the moment a co-agent's `perf` took
  the quiet lane. Check `--health` for `"exclusive"` before starting a long run.
- **A daemon restart kills every leased page.** A second run died at 6m51s with
  the identical message; `uptimeSec` was 5 and `started` three seconds before
  the error.

Neither is a bug exactly, but a probe that runs for a quarter of an hour is a
new kind of client for this daemon, and it is the first one to notice.

## A useful side finding: the session is deterministic

Per-minute km, encounter count and forage count are **identical** across
1600×900, 800×450 and 640×360, and identical between the dev and prod builds.
Minute 6 reads `2.14 km, 4 encounters, 19 forage` in every post-fix run.
Viewport and bundling change how long the run takes and nothing about what
happens in it — which is what makes the table above a fair comparison, and what
lets a shorter run stand in for a longer one when diagnosing.

## What a reader should conclude

1. **Do not tick the box.** There is still no completed 30-minute run. The
   longest is 28 minutes.
2. **Do not blame the game for that.** Nothing in any run stalled, errored,
   refused a verb or ran out of things to do. Every ending was the harness
   closing the page, and the failure mode is fully understood and cheap to fix.
3. **The evidence that does exist is good.** 28 unbroken minutes, 10 km, 22
   encounters that all resolved, 81 forage pickups, four quests still live, every
   menu, the map, camping and the shop all still answering at minute 28, zero
   page errors, and a flat heap.
4. **`longplay` is now worth running.** It defaults to 30 minutes, it says how
   much wall clock that costs, it heartbeats every game minute so a killed run
   still reports how far it got, and it no longer measures a character standing
   against a hill.
5. **Next step, for whoever owns the harness:** pass `ttlMs` on the probe's
   lease. Then run this again and the box can be judged on its merits.
