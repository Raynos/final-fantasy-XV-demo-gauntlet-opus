# benchmaxx — the harness's own wall clock

Owner: opus, 2026-08-27. Plan: `docs/plans/2026-08-24-opus-benchmaxx-harness.md`
(v2). This lane implements it; the plan session deliberately did not.

## What is done and verified

**Phase A — the job ledger.** `src/tools/ledger.mts` writes one JSONL line per
job to `~/.cache/ffxv-harness/<keyhash>/jobs.jsonl`, rotated at 10 MB.
`Counters` carries `queuedMs`/`ranMs`/`queueAhead` and `call()` prints one exit
line past a threshold, so a slow call names its own reason in the transcript.
Autostart logs to `daemon.log` instead of `stdio: 'ignore'`. `/health` grew
cumulative totals, live leases, chromium RSS and a `paintedFaces` warning.
`src/tools/harnessstats.mts` reads it all back.
*Verified:* ledger lines for every job of a full `check`; `harnessstats --since
1h --slow 5` renders them; `--health` printed the painted-face warning while the
cache was genuinely missing, and stopped once `build:full` restored it.

**Phase B — the wait primitive, then the ban.** `daemon.mts --wait
quiet|exclusive-free|idle --for <s>`; `src/tools/gitlock.mts` (capped backoff on
`.git/index.lock`, names the holding pid, distinguishes a stale lock);
`announceBuild()` prints `expect ~Ns` from the tool's own ledger history;
`.claude/hooks/guard-poll.sh` hard-blocks four poll shapes with `CC_ALLOW_POLL=1`
logged. Pre-commit runs its three jobs concurrently; post-commit prewarms.
*Verified:* `--wait quiet` returned after 9.8 s on a busy daemon; the guard was
exercised against six shapes including the two false positives it must not fire
on (a commit message describing a poll loop, and `check.mts` itself).

**Phase C — the gate suite.** `src/tools/gatecache.mts` (PASS only, keyed on the
full tree sha, never on a dirty tree); two pools (`cpu` / `browser`,
longest-first) instead of one serial queue; `HARNESS_LANE=sweep` for the whole
suite; a ratchet on the suite's own wall time in `project/check-baseline.json`.
`drawcheck` captures its chunks `--par 4` and memoises a full corpus per sha.
*Verified:* **18/18 in ~270 s against ~780 s serial.** A second `check` on the same
clean tree is **0.68 s**, and `drawcheck` on a memoised tree is **0.18 s**.

The one counter-intuitive result: `drawcheck --par 4` halves the gate standalone
(269 -> 120 s) and made the SUITE slower (420 s), because four chunks starve
every other browser gate out of a pool of four. It runs `--par 2` inside `check`
and 4 outside. Making one gate faster made the whole thing slower, and only the
ledger showed it.

**Phase D — measured first.** `src/tools/probes/turbocost.mts` prices a stepped
frame by A/B/A ablation of `post.render`: **draw submission is 11.0 ms of an
11.66 ms frame — 95% — against 0.16 ms of A/B/A drift; the simulation is
0.58 ms.** That is the answer to the plan's own open question (`gameplay` priced
the sim at 4.3-7.8 ms and predicted 0.26-0.47 wall-min/game-min against an
observed 0.7; the missing half was never the sim, and the sim is not even the
4.3 ms). `probe.mts --turbo <N>` submits one frame in N, defaulting to the
largest ratio measured byte-identical. **`/exclusive` no longer closes a leased
page** — it queues behind live leases bounded by their TTL and refuses as `busy`,
naming the probe and its remaining seconds.
*Verified:* `--turbo 10` takes a 6-game-minute `longplay` from **4.5 to 0.6 wall
minutes (7.5x) with identical telemetry** — see the table below.

**Phase E / F.** Prewarm on commit; `/health` warns on the missing painted-face
cache; RSS in the ledger. Policy written into `CLAUDE.md` (150-turn cap,
`gitlock`, never poll, the suite's new shape) and `HANDOFF.md` §4 (caps, the ban
and its replacements, look-loops in disposable context, one `shoot` call per
batch). Three new entries in `LANDMINES.md`.

## Turbo: the ratio matters, and 10 is the answer

`project/TIMINGS.md` records `longplay` as deterministic — minute 6 reads
**2.14 km, 4 encounters, 19 forage** at every viewport and in both dev and prod.
Four six-game-minute runs against that:

| | wall-min per game-min | telemetry |
|---|---|---|
| plain | 0.75 | 2.14 km, 4 enc, 19 forage, 13 kills |
| `--turbo 2` | 0.37 | **identical** |
| `--turbo 10` | **0.10** | **identical** |
| `--turbo 60` | 0.06 | 2.13 km, 3 enc, 18 forage, 10 kills |

So **`--turbo` defaults to 10**: the largest ratio measured byte-identical, and
already 7.5×. A thirty-game-minute session goes from ~22 wall-minutes to ~3,
which clears Phase D's ≤12 with the telemetry intact rather than by redefining
it. `probe.mts` warns at startup for any N above 10.

**The drift at 60 is a lead, not a mystery.** `seatcheck` proves
`Terrain.drawnHeightAt` is the renderer's own arithmetic against the *rasterised
clipmap*, and a frame that is never submitted does not refresh it — so the player
walks on a stale height field, the route moves, and the route is what encounters
and forage key off. Somebody wanting N > 10 should confirm that with a probe and
then decide whether the clipmap update belongs outside `post.render()`; the
payoff past 10 is small (0.10 → 0.06) so it is not urgent.

## Left to do

- The plan's definition of done is **weekly**, not per-session: self-inflicted
  wait ≤30 min/week, fix-lane p50 ≤2 s, median `shoot` ≤8 s, zero probe deaths
  by exclusive. All of it is now readable in one command (`harnessstats`); none
  of it can be closed by one session. Re-check after a week of ledger.
- Phase D's last bullet, unimplemented: probes registering a **CPU-budget tag**
  so `check`'s parallel phase and a live probe do not oversubscribe the box.
  Today `check`'s browser pool and a probe both go through the daemon, so the
  budget of four is respected — but four gates plus a probe is still five
  processes wanting the GPU.
- `drawcheck` reports `town_forecourt` **cleared the budget outright** (786
  against 800). `project/draw-baseline.json`'s last debt entry can be deleted
  with `--set-baseline` once somebody confirms it across two runs; `STATUS.md`
  says the shot's spread is wider than the ratchet's tolerance, so confirm
  rather than assume.

## Files touched

`src/tools/`: `ledger.mts` `gatecache.mts` `harnessstats.mts` `gitlock.mts`
(new); `daemon.mts` `harness.mts` `check.mts` `drawcheck.mts` `probe.mts`;
`probes/turbocost.mts` (new).
Hooks: `.claude/hooks/guard-poll.sh` (new), `.claude/settings.json`,
`.githooks/pre-commit`, `.githooks/post-commit` (new).
Docs: `CLAUDE.md` `project/HANDOFF.md` `project/LANDMINES.md`
`src/tools/README.md` `project/TIMINGS.md` `project/check-baseline.json` (new).

**PROTOCOL is 5.** Bumping it restarts the daemon, which closes every leased
page — see the new `LANDMINES.md` entry. Land a daemon change when
`daemon.mts --wait quiet --for 900` says the machine is idle.
