# Close-out: one plan, ten items, every one of them finishable

Status: DONE (2026-08-28, opus) — **eight of ten closed the same night.**
Supersedes `2026-08-24-opus-benchmaxx-harness`, `2026-08-27-opus-gate-audit` and
`2026-08-28-opus-the-100x-map`, all three archived with this plan named. Items
8b and 10 were builds rather than fixes and went to
`2026-08-26-opus-the-standing-backlog` §WS-12, with every number below; the six
measured negatives went to that plan's negatives table and to `LANDMINES.md`.
**See "What actually happened" at the end — five of the ten closed as negative
results, and two of the numbers this plan was written against were wrong.**

Three plans sat IN-PROGRESS with no owner between them. None was half-built: two
had shipped everything they specified and were held open by bookkeeping, and the
third was a retrospective wearing a plan's `Status:` line. What was actually left
across all three is **ten items**, and they share one spine.

## The spine

**A page boots in 7.46 s and everything expensive in this repo is a multiple of
that number.**

- The gate suite takes 188 cold boots across 190 lease jobs.
- The human's `TODO.md` line 1 is *"Wow starting a new page takes forever"* and
  line 2 is *"1.4 GB of RAM"* — the ledger now says **2 449 MB for one page,
  p50 10 875 MB across the pool, peak 18 901 MB**.
- Benchmaxx's one failing number is median `shoot` — and a shoot is a boot.

So the boot is not one of the ten items. It is what eight of them are for.

## What the ledger already closed

Benchmaxx's definition of done was written as *weekly*, which is why it never
closed. It does not need a week; it needs a ledger, and there is one — **1758
jobs, 906.7 minutes of run**. Read tonight, **five of six pass**:

| DoD | target | measured | |
|---|---|---|---|
| fix-lane p50 queue | ≤2 s | **0.00 s** (p90 0.00 s) | pass |
| same-sha `check` | ≤5 s | **0.2 s** | pass |
| cold suite, quiet | ≤3 min | **71.6 s** | pass |
| self-inflicted wait | ≤30 min/wk | **10.9 min queue total, 1% of wall** | pass |
| 30 game-min probe | ≤12 wall-min | **~3** (`--turbo 10`) | pass |
| **median `shoot`** | **≤8 s** | **22.6 s** (p90 **93.8 s**) | **FAIL** |

That single failure is item 8's DoD, and it is the honest reason the boot work
is in scope rather than deferred to a game lane.

Also read out of the same ledger and not previously noticed: **80 of 1758 jobs
returned `error`** (4.5%), concentrated in `shots` (6), `tool:drawcheck` (7) and
`tool:integration` (7). Nobody has looked at one. That is item 4.

## The ten

Ordered so that each is unblocked by the one before it. Every row carries the
measurement that justifies it; a row without one does not belong here.

### 1 — Delete `$SP/`, and hold the root at fourteen entries

An empty directory named `$SP` sits at the repo root, created 2026-08-27 23:25
by a command whose variable never expanded. It is untracked, so `git status`
reads clean and it is invisible to every gate.

`TODO.md` line 3 is *"Repo feels chaotic, with too many top level files"*. The
root is fourteen real entries and `CLAUDE.md` already says what may live there;
what it lacks is enforcement. Add the root roster to `.githooks/pre-commit` as a
predicate, the way `LANDMINES.md` entries became predicates rather than prose.

**DoD:** `$SP/` gone; a new root entry fails pre-commit by name.

### 2 — `drawcheck`'s 36th field

The gate disagrees with itself on 25 of 142 shots by up to **60 draw calls**
against `TOLERANCE = 8`. Six hypotheses are dead — frame parity (`resetClock`),
chunk sizing, wasted boots, cross-shot accumulation, lazy bestiary construction,
and the enemy roster. Each was measured; each was wrong.

What survived is much sharper than where it started. The gap is **perfectly
deterministic** — `579 514 514 514 514 574 514`, identical across three daemon
restarts — and it tracks **boot-versus-reuse and nothing else**. A reused page
draws 60 fewer calls than a booted one. `resetcheck.mts` digests 35 fields and
they are all clean, so the answer is in a 36th the digest does not cover.

The next step is a bisect, not a guess: extend the digest until it moves, then
name the field. Candidate surface, in order of suspicion — the shadow cascade
refresh schedule (`poi_reststop` is measured at 707/855/707/1005 across a held
pose as three cascades rotate), then LOD ring residency, then anything keyed on
frame index rather than state.

**Until this closes, no drawcheck verdict finer than 60 calls is evidence** —
including the +20 that reverted the settle ablation.

**DoD:** the field is named and covered by `resetcheck`; three consecutive
corpus passes agree within `TOLERANCE`, booted and reused.

### 3 — Drop `town_forecourt` from the draw baseline

`project/draw-baseline.json`'s last debt entry reads **786 against a budget of
800** — it has cleared outright. `STATUS.md` says the shot's spread across runs
is wider than the ratchet's tolerance, so it is confirmed across two runs and
then removed with `--set-baseline`, not assumed.

Gated behind item 2: confirming a 786 while the instrument has a ±60 fault is
exactly the mistake this plan exists to stop making.

**DoD:** baseline empty; `drawcheck` passes with no debt row.

### 4 — The 80 error verdicts

4.5% of ledger jobs. Unknown whether they are one flake, one bug, or four. Group
them by `kind` and message, then either fix or record with a reason. A harness
that reports its own error rate and nobody reads it is an instrument without a
reader.

**DoD:** every error class named; error rate under 1% or each residual explained
in `LANDMINES.md`.

### 5 — Probes register a CPU-budget tag

Phase D's last unimplemented bullet. `check`'s browser pool and a live probe both
route through the daemon, so the budget of four is respected — but four gates
plus a probe is still five processes contending for one GPU, and the ledger's
peak **18 901 MB** is what that looks like.

**DoD:** a probe declares its cost; `check`'s parallel phase subtracts it from
the machine budget rather than racing it.

### 6 — `driftcheck`'s probe is priced by nobody

33.6 s, the third-longest gate, and the least examined of the three. It runs a
**160×160 = 25 600-texel probe three times**, a **28-stop tour** at
`tourSettle: 40` frames per stop, and `settle: 60` at home. Not one of those
constants has an argument attached to it. `tol` and `tolCpu` are carefully
reasoned in a comment; the sampling that feeds them is not.

The question is whether a 25 600-texel field detects a clipmap morph bug that
6 400 texels misses, and whether 40 settle frames is measured or inherited. Halve
each independently against the known-bad case; keep whatever the fault still
trips.

**DoD:** each constant either falls or gains a comment saying what it costs and
what it catches. Any reduction proven against a deliberately broken clipmap.

### 7 — Standardise the play-gate viewports

`pageKey` is `build | WxH | query`, and only `/shots` pools a page, so the only
inheritable page is shoot-mode at the capture viewport. Warm leases went to
`heightcheck` (**7.1x**) and `creaturecheck` (**6.8x**), byte-identical. The
reachable set was three and `floatcheck` failed its verdict test (91 vs 115).

`integration` and `combatloop` are excluded **only because they ask for
1280×720** — 38 s of gate time behind a viewport constant. Move them to the
capture viewport and re-test. Both are documented reuse burns, so each needs the
byte-identical verdict test before the flag goes on, and a flag that cannot fire
does not go on at all: that is why `uxcheck` was tested, passed, and deliberately
did **not** get `reuse` (48.5 → 46.8 s is noise, not a skipped boot).

`reachcheck` stays cold on principle even though it could inherit — its whole
purpose is "did this code run", so a page that has already run code is the wrong
oracle. Its counts drift 93 038 vs 93 080 and that is the measurement saying so.

**DoD:** both gates byte-identical across three runs warm, or both stay cold with
the numbers recorded here.

### 8 — Cache generated content

`bootprof --dirty` on a 6.5 s boot:

    1959 ms  postfx+compile+warmup   <- item 9
    1277 ms  Vegetation
     858 ms  Props
     374 ms  Water
     363 ms  Npcs

**~2.1 s of every boot rebuilds content that is a pure function of a seed and
some source files.** The bake cache already proves the pattern in this repo:
key on the generator source, materialise into `src/public/baked/`, copy to
`dist/baked/` at build, symlink into every materialised tree.

This is the item that moves median `shoot` 22.6 s toward 8 s, and it is the
human's `TODO.md` line 1.

**DoD:** median `shoot` ≤8 s over a fresh ledger window; boot under 4.5 s;
`build:full` produces the cache and `--health` warns when it is missing, exactly
as the painted-face cache does.

### 9 — 181 shader programs that never cache

A **warm** load compiles **181 programs in 1711 ms**, within 3% of cold, while
`--health` reports `persistentProfile: true` and `chromium.mts` implements it
correctly (`launchPersistentContext`, one machine-wide profile). 1.7 s × ~10
boots per suite, and every player pays it too.

**Hypothesis, untested:** `CHROMIUM_ARGS` pins `--use-angle=metal`, and ANGLE's
Metal backend exposes no program binaries, so Chromium's shader disk cache has
nothing to store. The cheap experiment is one `bootprof` run with
`--use-angle=gl`, nothing else changed, comparing `+N programs` and warmup ms.

**Do not casually make that the default** — the backend decides pixels, so it
moves every image baseline in the repo. Measure, then decide whether a
re-baseline is worth it. Already known and not to be re-tried: `compileAsync` is
**3% slower** and was reverted; `gl` and `metal` both compiled +181 on a warm
load in the audit's own test, which is what makes this a *disk-cache* question
rather than a backend one.

**DoD:** either the cache works and the 1.7 s is gone, or the reason it cannot
is written down and item 10 absorbs the cost.

### 10 — Material consolidation

`probes/drawwhere.mts` attributes every call through `renderBufferDirect`. On
`town_forecourt`: 496 calls but **5 231 106 triangles**, a third of it skinned
character mesh at ~29k triangles per draw with no LOD, across **288 distinct
object/material buckets**. 152 calls draw under 60 triangles each. The bucket
count is also the likely source of the 181 programs, and of
`Trying to use 16 texture units while this GPU supports only 16`, logged dozens
of times a frame.

One fix pays boot, frame *and* texture-unit exhaustion. 127 material
construction sites. It is the largest item here and the only one that moves
pixels, so it goes last, behind a `perf`/`gameplay` re-certification and image
diffs on the corpus.

**Not a cost today** — the game is **mean 208 fps against a 60 fps target**, so
this is bought for boot and for headroom, not for frame rate. If the schedule
breaks, this is the item that gets cut, and it gets cut with this paragraph as
the reason.

**DoD:** buckets materially down; 18/18; both perf gates still certify; corpus
image diff shows no regression beyond the 1.5/255 floor.

## Killed, with the measurement — do not re-open

Half the value of the three superseded audits was in what they falsified. These
are dead, and re-deriving them costs a session each.

- **Scheduling and packing.** 233.5 browser slot-seconds ÷ 3 slots = 77.8 s ideal
  against 83.1 s actual. **5.3 s left, total.**
- **CPU-lane parallelism** (worker threads, shared `Field`, `tsc --incremental`).
  The CPU lane has **71 s of slack** and finishes at 11.9 s. Worth **0 s** until
  the browser lane drops below ~12 s.
- **More browser workers.** Four give 1.5x throughput and **7.3x worse per-shot
  latency**. A gate suite is latency-bound.
- **Deleting the exclusive lease.** `cold` and the lock are different arguments to
  `pool.lease`. Saves zero boots; would let two tools drive one page.
- **Fixing "wasted" page boots.** 19 → 1 bought 16 s and **0 s of suite wall**.
  Leases boot 1.008 times each, structurally forced.
- **Serialising cold boots across slots.** ~22 worker-seconds, **0 s of wall** —
  the daemon is idle 63% of the window.
- **Per-gate dependency graphs.** Marginal on top of the input-key cache, which
  errs wide and already captures the 70%.
- **Character LOD.** 5.2 M triangles is real and latent; at 208 fps it costs
  nothing. Folded into item 10 rather than run as its own line.
- **Deleting any gate.** Eighteen were audited one at a time. **Zero** have a
  wrong or worthless assertion. The suite's problem was never what it asserts.

## The suite's own history, so nobody re-litigates the wins

| | before | now |
|---|---|---|
| cold, quiet, 18/18 | ~780 s serial | **71.6 s** |
| after a docs commit — 43% of commits | 308.9 s | **8.2 s** |
| after a harness commit — 27% of commits | 308.9 s | **8.5 s** |
| same tree | ~780 s | **0.2 s** |

**84 of the last 120 commits touch no game code at all.** Keying each gate on the
bytes it reads was worth more than every scheduling idea combined, and the
scheduling ideas are the ones killed above.

## Definition of done — checkable tonight, not weekly

The predecessor plan's DoD could not close because it was written against a
calendar. This one is written against instruments that already exist:

- `pnpm run check` 18/18, cold, **under 60 s** on a quiet tree
- median `shoot` **≤8 s** and p90 **≤25 s** over a ledger window taken after
  item 8 (`harnessstats.mts`)
- cold boot **under 4.5 s** (`bootprof`)
- `drawcheck` agrees with itself within `TOLERANCE` across three runs, booted and
  reused; `draw-baseline.json` empty
- ledger error rate **under 1%**, or each residual named in `LANDMINES.md`
- both perf gates still certify; corpus image diff clean at the 1.5/255 floor
- root holds fourteen entries and the hook enforces it

Any item that cannot show its number is not done, whatever its diff says.

## What actually happened

Written the same night the work was done, against the ten items above.

| | item | outcome |
|---|---|---|
| 1 | root roster | **done.** `$SP/` gone; the roster is a pre-commit predicate with two arms, staged (blocks) and untracked (warns) |
| 2 | `drawcheck`'s 36th field | **done, and it was two fields.** Named, fixed, instrumented |
| 3 | drop the draw baseline | **done.** 0 of 142 shots over 800, worst 786; the file is deleted and `--set-baseline` now deletes rather than writing empty |
| 4 | the 80 error verdicts | **done.** 12 were real (0.66%); the ledger was calling a red gate an error |
| 5 | probe CPU-budget tag | **done.** Declared, reported in `/health`, subtracted by `check`. Phase D is finally complete |
| 6 | `driftcheck`'s probe | **done, and it was blind.** A 5 m morph error moved nothing; the rect is 340 m now |
| 7 | play-gate viewports | **closed negative, with numbers.** Not reachable |
| 8 | median `shoot` / content cache | **the metric was wrong**; the cache is WS-12a |
| 9 | 181 shader programs | **closed negative on both routes** |
| 10 | material consolidation | **not started** — WS-12b |

### The two numbers this plan was written against, both wrong

**"Median `shoot` is 22.6 s against a target of 8."** This was benchmaxx's one
failing DoD and the entire reason the boot diet was in scope. It is a population
artefact: `kind: 'shots'` is one ledger row whether the job posed one shot or
sixteen, and **370 of 378 rows were `drawcheck` corpus chunks**. A real `shoot`
is 8.0 s p50 — at target — and timed directly, a cold single shot is 8 s, a warm
one is **1 s**, and four warm shots are 4 s. `JobRecord.units` now records how
many shots a job posed so the median is a median of shoots.

**"80 errors in 1818 jobs, 4.5%."** 28 were a gate returning FAIL or VOID, 40
were a `tool:` row echoing a child already counted, and **12 were real — 0.66%**,
nine of them inside the 17:22–17:49 window when `PROTOCOL` went 5 to 6, which is
a documented landmine rather than a new fault.

Both are the same defect: **an instrument that folds "the thing I measured is
bad" into "I could not measure", or one duration into a different unit of work.**
The suite already knew this — `VOID` exists in `check.mts` for exactly this
reason — and the ledger had simply never been given the vocabulary.

### Five of ten closed as negative results

That is the honest ratio and it is worth stating, because a plan that reports
eight wins reads very differently from one that reports three wins, five
falsifications and two builds handed on:

- Deleting `Vegetation`'s origin prime: 610 ms, and it moves `hero_full` by
  **13.359/255** against a 2.25 floor. Four of five shots said it was free.
- `combatloop` matching the pool key: **+28 s to save 7.5 s.**
- `integration` taking a warm lease: impossible, it needs `audio=force`.
- Chromium's disk cache holding the 181 programs: ANGLE translates in-process.
- Skipping the shader warm-up: **0.53 s, not the 1.71 s its own line claims.**

Each is in the standing backlog's negatives table, `LANDMINES.md`, or
`src/tools/README.md` — somewhere a person will actually look, not in a plan
that was about to be archived.

### The one that changed how the gates are read

`drawcheck`'s ±60 self-disagreement, six hypotheses deep, was **not one bug**:

1. `VehicleBody` and `Player` damp attitude and gait *exponentially*. An
   exponential damp is asymptotic: at the 68 frames a pose runs it is still
   moving by more than `VelocityPass`'s 1e-6 threshold, so twenty Regalia meshes
   and five of Noctis's accessories drew a velocity proxy each on a page's first
   pose and none after. `town_forecourt` 806/786/786/786 → flat **786**. Both now
   implement `converge()`, which `Vegetation` and `Props` have had all along.
2. `setpiece_deadeye`'s remaining 65 is **not a bug**:
   `Director._setPieceScenario` turns the encounter loop back on deliberately, so
   the fight really does have 16 enemies on a cold page and 4 later. It costs the
   gate nothing — the ratchet grades only shots over budget, and it sits 220
   under.

The instrument that found it is `probes/thesixty.mts`, and the method is the
point: six earlier hypotheses were guesses about the mechanism, and this one
asked the renderer which objects it drew, then walked the geometry uuid back
from an anonymous proxy to the thing in the world that owns it.

### What is left

`2026-08-26-opus-the-standing-backlog` §WS-12: **12a** the generated-content
cache (~1.5 s of a 6.5 s boot, and the bake pattern already exists), **12b**
material consolidation (288 buckets, 127 sites, 5.2 M triangles — and not a cost
today at mean 208 fps).
