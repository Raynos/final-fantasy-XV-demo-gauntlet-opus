# Benchmaxx: make the loop fast, not the agents patient

Status: PROPOSED (2026-08-24, opus). Evidence:
`project/audits/2026-08-24-toolcall-wallclock.md` (48 h of transcripts, measured)
and `project/journal/2026-08-23-harness-bench.md` (harness microbenchmarks).

The measured shape of 48 h of agent time: **45.5 h of tool wall-clock, 61 h of
model latency between calls.** Of the tool half, the biggest sinks are (1)
agents sleeping in poll loops, (2) captures paying a 9.2 s page boot they
shouldn't, (3) 1 005 cold typechecks, (4) serial uncached gate suites. Every
phase below names its measured baseline and a target, and none is speculative
about where time goes — the audit is the receipts.

Ordering is by (minutes saved) / (effort), and phases are independent unless
noted.

---

## Phase 1 — Ban waiting: background tasks instead of sleep loops

**Baseline: ~617 min/48 h in `Bash:other`, mostly `sleep`-poll loops; dozens of
600 s timeouts.** This is the cheapest 8–10 h/48 h in the repo and needs no
harness code.

1. **PreToolUse hook that rejects poll loops.** A `settings.json` hook matching
   Bash commands against `\b(sleep\s+\d+.*done|while.*Date\.now\(\)<)` (and
   `until [ -f` + `sleep`) rejects with a one-line message: *"Run the slow
   command with `run_in_background: true`; you are re-invoked when it exits.
   Do not poll."* Allow a `sleep` ≤ 5 s not inside a loop.
2. **CLAUDE.md one-liner** under "Running the harness": *"Never write a
   sleep/poll loop. Long command → `run_in_background`. A Bash call that ends
   at 600 s is a bug you wrote."*
3. **Tools already exit promptly** — the retry-in-a-loop pattern (`until
   probe.mts …; sleep 30`) hides real failures for 10 min. Same hook catches
   it; the failure prints instead.

Target: `Bash:other` under 100 min/48 h. Measure by re-running the audit
script after two working days.

## Phase 2 — Typecheck in ~1 s: incremental tsc everywhere

**Baseline: 1 005 calls × 6.4 s avg = 107 min, plus the same cost inside 891
pre-commit hook runs (git bucket, 353 min).**

1. Add `"incremental": true` + `tsBuildInfoFile` to both tsconfigs. Warm
   incremental `tsc --noEmit` on an unchanged tree is sub-second; on a
   one-file edit ~1–2 s.
2. **Shared-trunk gotcha:** multiple agents commit from one checkout, so one
   shared `.tsbuildinfo` is fine (it keys on file content, races only cost a
   redundant rebuild) — put both files in `node_modules/.cache/tsbuildinfo/`
   (already ignored), never in `tmp/` (delete-whole rule) and never per-agent
   (defeats warmth).
3. Pre-commit hook unchanged otherwise: vite build is already 0.56 s warm; the
   hook drops from ~20 s to ~3 s, which pays on all ~450 commits/48 h.

Target: `Bash:typecheck` under 15 min/48 h; median git commit under 5 s.

## Phase 3 — Captures: never boot for a shot, and batch by default

**Baseline: shoot.mts 864 calls, avg 38.9 s against a 2.3 s warm-page render.**
The gap is page boot (9.2 s) + sha materialisation + queueing, paid because
agents commit (new sha) then immediately shoot, and shoot one frame per Bash
call.

1. **Prewarm on commit (biggest single win).** post-commit hook POSTs the new
   sha to a daemon `/prewarm` route: materialise the tree (~0.75 s), boot one
   page to `GAME.ready` in the background, park it warm. The agent spends the
   next 30–120 s writing its commit message and thinking; by first capture the
   page is hot. Cap: prewarmed pages count against BROWSER_BUDGET but are
   evictable the moment a `fix` lease wants a slot (prewarm must never queue
   ahead of real work). Bump `PROTOCOL`.
2. **Batch is already built — make it the path of least resistance.**
   `shoot.mts a b c` renders N shots on one warm page. Add to CLAUDE.md:
   *"One shoot invocation per review round, all names at once — 5 shots ≈
   boot + 5×2.3 s, not 5×boot."* Optional: shoot prints a nudge when invoked
   with one name twice within a minute (cheap, in-tool, no daemon change).
3. **Same-page cross-sha reuse is NOT proposed:** the soft-reset contract is
   per-build; navigating a warm page to a new sha's server is a reload anyway
   (11.1 s ≈ boot). Prewarm makes it moot.
4. Review captures stay `--jpeg` (already the rule; keeps model-gap time down
   too — smaller images, less to look at).

Target: median shoot.mts call under 8 s; a 5-shot batch under 25 s warm,
under 35 s cold-with-prewarm.

## Phase 4 — `check` in seconds: gate result cache + parallel lanes

**Baseline: 57 full runs, avg 124.6 s, worst 592 s; most runs re-verify gates
whose inputs did not change.** The suite is ~15 gates run serially while 4
browser slots sit mostly idle.

1. **Cache gate verdicts by tree sha.** `check.mts` computes the build sha it
   already resolves; store `{gate, sha, pass, summary}` in
   `~/.cache/ffxv-harness/gatecache/`. A re-run on the same sha replays
   instantly. This alone turns the "run check again to see the table" habit
   (measured, repeatedly) into ~1 s.
2. **Input-scoped shas.** Most gates read a subset of `src/`: e.g.
   `silhouette` = trees+bestiary code, `hydrocheck` = terrain. Key each gate
   on `git rev-parse HEAD:<paths…>` of its declared inputs, so a face edit
   does not re-run hydrology. Start with the 5 push gates; a gate with no
   declared scope keys on the full tree (always re-runs — safe default).
   **Declared scopes must be honest — an under-declared scope is a gate that
   silently stops running; reviewer checks the scope list against imports.**
3. **Run browser gates through the daemon's sweep lane in parallel** (they
   are independent; integration/uxcheck/creaturecheck/combatloop/roadcheck
   currently serialize ~all of the wall time). 4 slots ≈ 3–4× on the
   browser-bound tail. Node-only gates run concurrently on CPU as now.
4. **Shard creaturecheck's 207 poses across the pool** (4 pages ≈ 4×) — same
   mechanism corpus capture already uses.

Target: unchanged tree `pnpm run check` ≤ 5 s (cache replay); one-subsystem
edit ≤ 60 s; full cold run ≤ 3 min. The literal 12 s ask is met on the two
common cases (replay, narrow edit); a full cold run of 15 real-browser gates
cannot hit 12 s at BROWSER_BUDGET=4 — GPU-bound, measured — and pretending
otherwise means deleting gates.

## Phase 5 — perf.mts / gameplay.mts: measure less, less often

These measure real frames in real time under an exclusive lease; the seconds
are the product. The waste around them is real though (227 + 46 min):

1. **Cache perf verdicts by sha like any gate** (Phase 4.1) — perf-r3 re-ran
   full suites to re-confirm numbers on unchanged trees.
2. **`--quick` mode:** half the segments, half the dwell per segment, for the
   edit loop; full sweep stays the gate. Validate `--quick` against full once
   (correlation, not equality) before trusting it — `pnpm run bench`
   methodology.
3. **Fail fast on a busy machine:** perf already needs the exclusive lease;
   add `--deadline` default so it 429s in seconds instead of queueing 10 min
   behind a sweep (the audit's 601 s perf rows are queue time, not
   measurement).

Target: perf bucket under 60 min/48 h with no loss of gate coverage.

## Phase 6 — Boot: 9.2 s → ~4 s, and the 1.4 GB

`project/TODO.md`'s two complaints are one phase: boot time and RSS are both
"the game builds too much before first frame". Also the multiplier on Phase 3
(every page boot everywhere).

1. **Profile first** (`bootprof.mts` exists): attribute the 9.2 s. Known:
   painted-face cache absence alone is 6.9 → 9 s, so `build:full` freshness
   matters — make the daemon check the cache exists before serving a tree and
   warn in `/health` (it currently silently boots slow; the audit's shoot
   average eats this).
2. **`?shoot=1` boot diet:** a posed page needs no audio graph, no input
   bindings, no UI warm-up, no minimap bake. Gate them behind first use under
   `?shoot=1`. Every skipped subsystem must stay skipped *deterministically* —
   the two-boot diff floor (1.493/255) is re-measured after each cut, and any
   cut that moves it reverts.
3. **RSS:** 1.4 GB in `?debug` is likely dominated by terrain/scatter buffers
   kept CPU-side after GPU upload. bootprof + a heap snapshot names the top 3;
   fix those only. Lower RSS also cheapens 4-page residency.

Target: `GAME.ready` ≤ 4 s with baked caches present; page RSS ≤ 800 MB.
Measured deliverable: updated harness-bench journal table.

## Phase 7 — Spend the model less (the 61-hour half)

No harness change reaches the 3 666 min of model gap. Agent policy does:

1. **Batch independent tool calls in one turn** (the harness is safe for it —
   lanes/round-robin absorb concurrent asks). One turn issuing typecheck +
   shoot batch + git status beats three turns.
2. **Mechanical lanes run on cheaper/faster models** (Haiku/Sonnet subagents
   for corpus captures, log greps, retry-verification); Opus reserved for
   judgement (blind A/B, diagnosis). Fast mode for long mechanical stretches.
3. **Stop carrying pixels:** `--jpeg` everywhere (already the rule), crop
   before re-reading, and never re-Read an image already in context.
4. Session hygiene per CLAUDE.md: the 6 h 35 m session re-finding its own
   regressions is the pattern the 3 h rule exists to prevent.

## Sequencing and cost

| phase | effort | saved (of the measured 48 h) |
|---|---|---|
| 1 poll-loop ban | ~1 h (hook + docs) | ~8 h |
| 2 incremental tsc | ~1 h | ~4 h (typecheck + hook share of git) |
| 3 prewarm + batch norm | ~half day (daemon route + hook) | ~5 h |
| 4 gate cache + parallel | ~1 day | ~3 h + unblocks the check habit |
| 5 perf hygiene | ~half day | ~2 h |
| 6 boot diet | ~1–2 days, profile-led | multiplies 3–5 |
| 7 model spend | policy only | up to tens of hours |

Do 1+2 immediately (an hour, saves half a day per two). 3 next. 4 when a
coordinator next plans a gate-heavy round. 6 is the only one needing real
game-code care; profile before cutting, re-measure determinism after.

**Definition of done:** re-run the transcript audit after two working days of
agent traffic; the plan is DONE when tool wall-clock per 48 h is under 15 h
with the same gate roster, and no `maxS=600` rows remain in the poll bucket.
