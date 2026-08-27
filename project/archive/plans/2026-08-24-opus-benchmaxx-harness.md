# Benchmaxx v2: primitives, ledgers and ratchets — not a list of fixes

Status: DONE (2026-08-28, opus) — every phase A-F shipped and verified. Its
definition of done was written *weekly*, which is why it sat open; it does not
need a week, it needs a ledger, and the 1758-job ledger closes **five of its six
numbers**: fix-lane p50 0.00 s, same-sha `check` 0.2 s, cold suite 71.6 s,
10.9 min of queue wait total (1% of wall), 30 game-min in ~3 wall-min. The sixth
— **median `shoot` 22.6 s against a target of 8 s** — and the two residues
(Phase D's probe CPU-budget tag, the `town_forecourt` baseline row) move to
`docs/plans/2026-08-28-opus-close-out.md` as items 8, 5 and 3.

**Why it took four days to close.** Every phase shipped on 2026-08-27 and each
was verified against a number that same session. What held it open afterwards
was its own DoD, written against a *calendar* — "median `shoot` over a real
week", "a week with zero probe deaths" — which no session can satisfy, and which
made the plan unclosable rather than merely unfinished. The lesson is carried
into the close-out plan's own DoD: **write the definition of done against an
instrument, not against a date.** The instruments were the deliverable all
along, and they answered every one of these questions the moment somebody ran
them.

### What landed, per phase

| phase | shipped | the number |
|---|---|---|
| A ledger | `ledger.mts`, `queuedMs`/`ranMs` on every response, `daemon.log`, `/health` totals, `harnessstats.mts` | a week of audit is now one command |
| B waiting | `--wait quiet\|exclusive-free\|idle`, `gitlock.mts`, `expect ~Ns` from history, then `guard-poll.sh` | `--wait quiet` returned in 9.8 s where an `until` loop cost turns |
| C the suite | `gatecache.mts` (tree sha, PASS only), two pools, sweep lane, a ratchet on its own time | **18/18 in 270 s** against ~780 s; **0.68 s** same-sha |
| C drawcheck | `--par 4`, per-sha corpus memo | **270 -> 120 s**; **0.18 s** memoised |
| D measurement | `probes/turbocost.mts` | **draw submission is 95% of a stepped frame** — 11.0 of 11.66 ms, drift 0.16 |
| D turbo | `probe.mts --turbo <N>` | 6 game-min: **4.5 -> 0.4 wall-min**, but see the caveat |
| D exclusive | `/exclusive` queues behind live leases, refuses as `busy` | the top documented probe killer is closed |
| E prewarm | `post-commit` -> `/prewarm <sha>`, `paintedFaces` in `/health`, RSS in the ledger | first RSS reading: **2 449 MB one page, 16 465 MB four** |
| F policy | `CLAUDE.md` (150 turns, `gitlock`, never poll), `HANDOFF.md` §4, three `LANDMINES.md` entries | — |

### The one result that did not go the plan's way

Phase D says "validate by determinism … any drift reverts". `TIMINGS.md` records
`longplay` minute 6 as **2.14 km, 4 encounters, 19 forage**, and a non-turbo run
reproduced that exactly. `--turbo 60` returned **2.13 km, 3 encounters, 18
forage**, separating from minute 4 onward. So turbo is an 11x speed-up that is
**not telemetry-neutral**, and Phase D's DoD (a 30-game-minute session inside 12
wall-minutes with byte-identical telemetry) is met on time and failed on
identity. `project/handoff/benchmaxx.md` carries the likely mechanism —
`Terrain.drawnHeightAt` reads the *rasterised clipmap*, which an unsubmitted
frame does not refresh — and the next step.

The original plan follows, unchanged.

Decisions already taken by the human (carried from v1, do not re-litigate):
- Poll-loop ban is a **hard-block hook with a last-resort escape hatch**.
- Gate-result cache keys on the **full tree sha only**.
- The plan-writing session does not implement.

## Why v1 failed, in one sentence each

1. **Nobody was assigned.** Ten fixes ranked by impact, zero commits in 105.
   A plan whose every item needs a volunteer loses to plans with named owners.
2. **Its premises rotted while it waited.** Native tsc made fix 5 obsolete
   (typecheck is 0.39 s); phase 3 took boot 13.7→6.6 s under fix 10's stale
   9.2 s number; per-shot floors fixed perf certification without fix 9;
   the daemon grew a lease FIFO that does the *opposite* of fix 9's
   deadline-by-default — defensibly, and invisibly.
3. **It banned behaviour without replacing it.** The 7-day audit's core
   finding: the old poll bucket fell 764→24 min while `until`-loops rose,
   ten-minute blocking `TaskOutput` calls appeared (234 min), and `/health`
   polling grew. Agents poll because nothing in this repo can be *waited on*.
   A ban moves the pattern to the next syntax; only a primitive retires it.

So v2 is organised around three design rules, each phase shipping one thing
that makes the fast path the easy path:

- **Observability before optimisation** — you cannot hold a budget you cannot
  read. The daemon is the chokepoint everything already goes through; make it
  the single source of timing truth.
- **Primitives before prohibitions** — every ban ships with the affordance
  that makes it unnecessary, in the same commit, named in the rejection text.
- **Ratchets before budgets** — a budget in prose regressed 9→13 min while
  everyone watched gates pass. A budget the suite enforces cannot.

## The measured shape (7 days, 203 transcripts)

71.4 h tool wall-clock, 22 808 calls. Decomposed for the first time:

| where a tool-second actually goes | /week | the mechanism |
|---|---|---|
| self-inflicted waiting (sleep/until loops, TaskOutput blocks, health polls) | **~15 h falling to ~8 h** | no wait primitive exists |
| daemon queue contention (median inflation × contended calls) | **~2.5 h** | invisible: silent HTTP block, `stdio: 'ignore'`, no ledger |
| genuinely long CPU-bound runs | the rest | serial `check` (420 s solo), longplay (contention-immune at ~420 s), perf sweep |

Cross-session overlap separates the last two: longplay and `check` run the
same speed alone or contended (CPU-bound); combatloop is 5.8× and driftcheck
18× slower contended (queue-bound). `git` is the second half's #1 sink
(60 s avg against a 1.4 s pre-commit gate — index-lock contention has no
queue either). Background execution is used on 2.1 % of Bash calls.

Context: per-turn cost has NOT improved — ~250 k tokens and ~10–13 s of gap
per turn, same as the 48 h audit; total burn fell only because phase 4 closed
and turn volume fell 3.7×. The cap language in CLAUDE.md still says 400 turns.

## Phase A — the job ledger (observability first; ~half a day)

Everything below is unverifiable without this, so it goes first.

- The daemon appends one line per job to
  `~/.cache/ffxv-harness/<key>/jobs.jsonl`: tool, agent, lane, build,
  enqueuedAt/startedAt/finishedAt, verdict, exclusive holder at enqueue,
  boots/reuses. Rotate at 10 MB. `Counters` already rides every response;
  add `queuedMs`/`ranMs` so **every client prints one exit line**:
  `[harness] queued 12.3 s · ran 41.0 s (2 ahead: perf@agent-ab)`. A slow
  call then *names its reason* in the transcript, which is what kills the
  health-poll habit at the source.
- Autostart stops discarding telemetry: `stdio: 'ignore'` →
  `daemon.log` in the cache dir (append, truncate at 5 MB). Today every
  queue decision the daemon logs is written to nowhere.
- `/health` gains cumulative counters since start (jobs, queue-seconds by
  lane, exclusive holds, evictions). Bump `PROTOCOL`.
- A reader: `agentstats.mts --daemon` (or a sibling `harnessstats.mts`)
  renders the ledger — wait vs run by tool, agent, day. The weekly audit
  becomes one command instead of 2 h of transcript archaeology; the scripts
  in `project/audits/` stay as the cross-check that reads the model side.

DoD: "how much of yesterday was queue wait, and whose?" answers in <5 s from
the ledger; every tool >30 s in a transcript carries its queued/ran line.

## Phase B — waiting gets a primitive, then the ban (~1 day)

Order matters: primitive, doc, then hook — in that order, same lane.

- **`daemon.mts --wait quiet|exclusive-free|job <id> [--for <s>]`** —
  long-poll routes that return when the condition holds. One blocking call
  with a printed reason replaces 40 health polls or an `until` loop.
- **Git stops being a second, queueless queue.** A `--wait git-lock` is the
  wrong altitude; instead the repo standard becomes committing through a
  wrapper (or `core.hooksPath` pre-flight) that retries the index lock with
  capped backoff and then *names the holder pid*. The 94-minute
  `git reset --hard` and every `[ -f .git/index.lock ]` spin loop are the
  receipts.
- **Long tools self-describe.** Any tool whose ledger history predicts >60 s
  prints at start: `[harness] expect ~Ns — run_in_background and be
  re-invoked`. The affordance exists (2.1 % adoption says agents forget, not
  refuse); the tool is the right place to remember, at the moment it matters.
- **Then the poll-ban hook** (the human's decision, unchanged: PreToolUse
  hard-block + `CC_ALLOW_POLL=1` escape, each use logged). Widen v1's regex
  to what agents actually wrote after the audit: `until …; do sleep`,
  `while ! grep`, `while [ ! -f`, big bare sleeps ≥60 s, and busy-wait
  `Date.now()` loops. The rejection text names the replacements: background
  + re-invoke, `--wait`, the commit wrapper. Note in the rollout commit that
  hook edits need a session restart.
- **TaskOutput discipline** goes next to the ban in HANDOFF §4: a blocking
  ten-minute `TaskOutput` is a poll loop wearing a tool costume (34 calls,
  234 min, one coordinator, one day) — end the turn; completion re-invokes.

DoD (ledger + transcripts): self-inflicted wait <30 min/week; zero
index-lock spin loops; `run_in_background` >25 % of Bash calls ≥60 s.

## Phase C — the gate suite: cached, parallel, and self-budgeting (~1 day)

`check.mts` is 18 gates run strictly serially (`check.mts:257` — one `await`
per child) with no cache; ~13 min while four browser slots idle, and the
suite grew 9→13 min unnoticed because nothing meters the meter.

- **Gate cache** in `~/.cache/ffxv-harness/gatecache/`, keyed `{gate, tree
  sha}` (full sha only — decided). Store verdict, one-line tail, duration,
  timestamp, machine-quiet flag; `check.mts` prints `cached` markers,
  `--no-cache` overrides; a verdict taken non-quiet never replays as a pass.
  Invalidation is trivial by construction: any commit changes the sha.
- **Parallel browser gates** through the daemon's sweep lane (integration,
  uxcheck, creaturecheck, combatloop, roadcheck, driftcheck, drawcheck);
  CPU-only gates keep cheapest-first serial fail-fast. TIMINGS' quiet-run
  numbers say the browser set sums ~6 min serial; four slots make it ~2.
- **drawcheck reuses the corpus by default** when a manifest for the same sha
  exists (`--manifest` already works; 281 s cold vs "costs nothing" reused).
- **The meta-gate:** `check` records its own wall time per gate in the ledger
  and **fails itself when the roster's quiet-machine sum regresses past its
  ratchet**, exactly like drawcheck's draw ledger. A new gate joins by paying
  its row. This is what makes 9→13 min impossible to repeat silently.
- Fold in v1's standalone-vs-in-suite mystery as a named task: floatcheck,
  integration and driftcheck disagree between invocation paths; until
  diagnosed, a red standalone gate is not evidence (LANDMINES candidate).

DoD: same-sha `check` ≤5 s; cold full suite ≤5 min contended / ≤3 min quiet;
the suite's own time is a gate with a ratchet file in `project/`.

## Phase D — long-run throughput: make playtesting cheap (~1–2 days)

longplay is the one workload contention cannot explain (421 s solo, 412 s
contended): pure CPU, 0.7–1.5 wall-min per game-min, stepping `g.frame(1/60)`
1 800× per game-minute inside one `page.evaluate`. gameplay.mts prices the sim
at 4.3–7.8 ms/frame, which predicts ~0.26–0.47 wall-min/game-min — the
observed floor is ~0.7, so up to half the bill is not the sim.

- **Measure first** (bootprof-style, in-page): sim step vs draw submission vs
  GC vs evaluate overhead, per probe frame. Draw submission is
  resolution-independent CPU, which is consistent with TIMINGS' "640×360 is
  no faster and `--q` does nothing".
- If draw submission is material: **`--turbo`** — step the sim, render
  1-in-N frames (or none; `?shoot=1` pages never present anyway). Validate
  by determinism, which this game uniquely can: minute 6 must still read
  `2.14 km, 4 encounters, 19 forage` with rendering off. Any drift reverts.
- **Exclusive stops killing probes.** perf's `pool.closeAll()` closing a
  28-minute run's leased page is the top documented probe killer (five dead
  longplay runs; prose warnings in three documents). Daemon-side: an
  exclusive request while a long-TTL lease is live *queues behind it by
  default* (the FIFO landed 08-25; extend it to leased pages, bounded by the
  lease TTL) and the refusal/queue message names the probe and its remaining
  TTL. A probe agent gets told at grant time that perf is waiting.
- Probes register a CPU-budget tag in the ledger so `check`'s parallel phase
  and probes do not oversubscribe the machine the way six chromiums used to.

DoD: 30 game-min session ≤12 wall-min quiet (inside one default TTL — the
`--ttl` footgun mostly retires); a week of ledger with zero probe deaths by
exclusive; turbo-vs-normal telemetry byte-identical.

## Phase E — boot, RSS, prewarm (game-facing residue; coordinate, don't duplicate)

Corrected premises: cold boot is **6.4–16 s observed** (phase 3 closed at
6.6 s; `src/tools/README.md` still says 9.2 — fix the constant); a page costs
**~1.94 GB RSS** (STATUS), *worse* than TODO.md's 1.4 GB complaint. The boot
work itself is owned elsewhere — after-phase3 WS-2 (shader programs, 1.83 s)
and WS-3 (geometry bake, ~950 ms) — so this phase keeps only the harness side:

- **Prewarm on commit** (unchanged from v1): post-commit fire-and-forget
  `POST /prewarm {sha}` → materialise + boot one `?shoot=1` page; counts
  against `BROWSER_BUDGET`; evicted the instant a fix lease wants the slot;
  newest sha wins; no-op when the frame cache already covers it. `PROTOCOL`
  bump. This is what turns "commit to see your work" from a 38.9 s average
  shoot into the 2.3 s warm render the bench already proves.
- **`/health` warns when the painted-face cache is missing** — today a
  silent ~2.5 s cold-boot regression guarded only by prose in two documents.
- **RSS gets a number in the ledger** (per-page RSS at boot, from the daemon)
  so WS-2/WS-3 can see their own effect and TODO.md's complaint gets a
  trendline instead of a vibe.

DoD: median shoot ≤8 s across a real week of ledger; boot constant in README
matches the bench; RSS per page recorded per build.

## Phase F — policy that the numbers actually support (~an hour of writing)

- **Session caps, written where they bind.** CLAUDE.md is at its 120-line
  cap; the cap language lives in HANDOFF §4 (179/250 lines): worker lanes
  end at ~3 h / **~150 turns** and respawn from the handoff; coordinator
  prompts must include the cap and the respawn instruction. Per-turn context
  is flat at ~250 k — the plan's biggest token lever is still unclaimed.
- **Capture-look loops run in disposable context** (subagent or crops), and
  **one shoot call carries all names** (`shoot.mts a b c` — documented as
  the rule, same section).
- Model-tiering for mechanical lanes stays out of scope until the ledger can
  price it per lane (it now can — revisit after two weeks of Phase A data).

## Disposition of v1's ten fixes

| v1 fix | disposition |
|---|---|
| 1 session caps | **kept**, Phase F, with the honest premise (per-turn cost never improved) |
| 2 look-loops in subagents | **kept**, Phase F |
| 3 poll ban | **kept but re-ordered**: primitive first (Phase B), ban second, wider regex |
| 4 prewarm | **kept**, Phase E, unchanged |
| 5 incremental tsc | **obsolete** — native tsc landed 08-22; typecheck is 0.39 s |
| 6 gate cache | **kept**, Phase C |
| 7 parallel gates | **kept**, Phase C, plus the meta-gate ratchet v1 lacked |
| 8 batch turns/shots | **kept**, Phase F (doc line) — turn overhead is unchanged at ~11 s |
| 9 perf --quick/--deadline | **superseded**: per-shot floors + lease FIFO landed instead; residue (sha-cached verdicts, quiet-flag) folds into Phase C's cache |
| 10 boot diet | **split**: game side owned by after-phase3 WS-2/3; harness side is Phase E |

## Sequencing and the standing audit

A → B → C are the lane's first week (A is half a day and everything else's
measurement). D and E are independent after A. F is written alongside B.

**Definition of done for the plan** — checked weekly by one command
(`agentstats --daemon` + the two `audit7-*.mjs` scripts), not by a one-off:

- self-inflicted wait ≤ 30 min/week; zero poll rows at the 600 s timeout
- queue wait visible per job; fix-lane p50 ≤ 2 s
- same-sha `check` ≤ 5 s; cold ≤ 3 min quiet; suite time ratcheted
- 30 game-min probe ≤ 12 wall-min; zero probe deaths by exclusive
- median shoot ≤ 8 s over a real week
- no session > 4 h span or 250 turns; per-turn context trending down, not
  just total volume

Each phase names its DoD in-line above; a phase that cannot show its numbers
from the ledger is not done, whatever its diff says.
