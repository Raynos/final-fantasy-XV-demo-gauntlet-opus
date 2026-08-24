# Where 48 hours of agent wall-clock actually went

2026-08-24, opus. Source: every Claude Code transcript under
`~/.claude/projects/<this repo>/` modified in the last 48 h — 108 jsonl files
(main sessions + subagent sidechains), 1.1 GB. Method: pair each `tool_use`
with its `tool_result`, duration = timestamp delta; "model gap" = time between
a tool result landing and the next assistant message that calls a tool
(i.e. API latency + thinking + prose). Script: session scratchpad
`audit-tools.mjs`; re-run it before extending these numbers.

## The headline

| bucket | total |
|---|---|
| tool calls measured | 14 314 |
| **tool wall-clock** | **2 730 min (45.5 h)** |
| **model gap (thinking/API, between calls)** | **3 666 min (61.1 h)** |

Two findings before any tool is blamed:

1. **The model is the bigger half.** 57 % of elapsed agent time is Opus
   thinking/API latency between tool calls, not tools running. No harness fix
   touches that; only agent behaviour does (batch independent calls in one
   turn, stop re-reading large outputs, use cheaper models for mechanical
   lanes).
2. **The #1 tool sink is not a tool — it is waiting.** `Bash:other` (617 min)
   is dominated by hand-rolled poll loops: `for i in $(seq 1 30); do pgrep -f
   check.mts || break; sleep 30; done`, `until [ -f shot.jpg ]; do sleep 15;
   done`, and in one case a **busy-wait** `node -e "while(Date.now()<t);"`.
   Dozens of calls sat at the full 600 s Bash timeout doing nothing. All of
   this is agents babysitting background work instead of using
   `run_in_background` and being re-invoked on completion.

## By category (top, of 48 h)

| category | calls | total | avg | worst |
|---|---|---|---|---|
| Bash:other (mostly sleep-poll loops) | 2 911 | 617 min | 12.7 s | 601 s |
| Bash:shoot.mts | 864 | 559 min | **38.9 s** | 600 s |
| Bash:git (hooks run vite build + 2× tsc) | 891 | 353 min | **23.8 s** | 600 s |
| Bash:probe.mts | 650 | 308 min | 28.4 s | 600 s |
| Bash:perf.mts | 151 | 227 min | 90.1 s | 601 s |
| Bash:check (full suite) | 57 | 118 min | **124.6 s** | 592 s |
| Bash:typecheck (bare tsc, cold every time) | **1 005** | 107 min | 6.4 s | 530 s |
| Bash:daemon.mts (health polls, waits) | 206 | 105 min | 30.6 s | 541 s |
| Bash:*check.mts (float/seat/night/lod) | 154 | 98 min | 38.3 s | 600 s |
| Bash:integration.mts | 132 | 49 min | 22.3 s | 426 s |
| Bash:gameplay.mts | 85 | 46 min | 32.5 s | 601 s |
| Bash:combatloop.mts | 51 | 43 min | 50.7 s | 600 s |
| Bash:node-inline | 106 | 37 min | 20.9 s | 601 s |
| Bash:read-shell (ls/cat/grep…) | 4 419 | 18 min | 0.3 s | — |
| Read / Write / Edit | 2 185 | ~2 min | ~0 s | — |

## The specific dumb patterns (with evidence)

- **Poll-with-sleep instead of background tasks.** The single largest sink.
  Every `maxS = 600/601` row above is a call that hit the Bash timeout — the
  agent then usually re-ran the same wait. Includes a literal CPU busy-wait.
- **Serial one-shot captures.** `shoot.mts` accepts N shot names in one
  invocation on one warm page (~2.3 s/frame after the first), yet the dominant
  pattern is one Bash call per shot, each paying daemon round-trip, sha
  materialisation and page boot for a freshly-committed tree. Hence 38.9 s
  average against a 2.3 s warm-page render.
- **1 005 typecheck invocations** of stock `tsc --noEmit` — no `--incremental`,
  no `.tsbuildinfo`, so every one re-checks the world from zero. 107 min of
  pure recompilation of unchanged code. The same cost is embedded in every
  commit: 891 git calls averaging 23.8 s are mostly the pre-commit hook
  (vite build ≈ 0.6 s warm + two cold tsc runs).
- **Retry-in-a-loop around flaky-looking tools** (`until node probe.mts …; do
  sleep 30; done`, `for i in 1 2 3; do combatloop …`) — burning a 600 s call
  to survive a failure that should surface immediately.
- **`pnpm run check` used as an edit-loop tool.** 57 full-suite runs in 48 h,
  avg 2 min, worst 10 min under contention — mostly re-verifying gates whose
  inputs had not changed since the previous run on a near-identical tree.
- **Wall-clock burned re-measuring perf on a busy machine.** perf.mts runs
  queue on the exclusive lease behind everything; several runs voided
  themselves anyway (see `project/handoff/perf-r3.md`).

## What is NOT broken

The daemon design is sound and already embodies the right big ideas: one shared
daemon, warm page pool with soft reset (1.97 s vs 11.1 s reload), frame cache,
sha-addressed trees at ~0.75 s each, BROWSER_BUDGET=4 (GPU-bound, measured),
fix/sweep lanes with per-agent round-robin, deadline→429, exclusive lease with
pid-liveness cleanup. `chromium.launch` appears in exactly one file. The
slowness is (a) game boot 9.2 s to `GAME.ready`, (b) gate suites running serial
and uncached, (c) agents not using the batch/background affordances that exist,
(d) Opus latency itself.

Plan that acts on this: `docs/plans/2026-08-24-opus-benchmaxx-harness.md`.

---

# Second pass: tokens, cache, and where the 61 h gap really goes

Same 108 transcripts, same window. Script: session scratchpad `audit2.mjs`
(dedupes usage by message id; gap anchored to the previous tool result).

## Token totals (48 h, all sessions + subagents)

| metric | value |
|---|---|
| assistant turns | 13 742 |
| output tokens | 3.78 M |
| — of which thinking | 523 k (**14 %**) |
| cache **read** input tokens | **3.18 B** |
| cache creation input tokens | 48.5 M |
| screenshots returned into context | 1 359 (520 MB of transcript) |
| tool-result bytes carried | 538 MB |

**The weekly limit is being spent on context re-reads, not on output.** The
top sessions ran 668–1 022 turns over 17–43 h while carrying ~300–530 k-token
contexts — e.g. one main session: 668 turns × ~533 k avg context = 356 M
cache-read tokens on its own. Output is a rounding error next to this.

## Gap decomposition

Per-turn generation speed has p90 ≈ 110 tok/s. Pricing every turn's output at
that rate explains **~525 min** of the **~3 177 min** gap. The remaining
**~44 h is per-turn overhead** — dominated by time-to-first-token on huge
contexts, plus API queueing/retries — i.e. ~11.6 s of non-generation overhead
per turn on average. So the "model is slow" problem and the "tokens are being
wasted" problem are the same problem: **context size taxes every turn twice**
(TTFT and cache-read spend), 13 742 times.

Thinking is NOT where Opus rabbit-holes — 14 % of output. The rabbit-holing
is in **turn count**, measured:

## Rabbit-hole receipts

| pattern | evidence |
|---|---|
| Same-shot polish loops | one agent captured `zone_longwythe` **48×**; others 47×, 25×, 21×; `hero_portrait` 27×; `vista_noon` 25× — dozens of look-tweak-look rounds per shot |
| Gate babysitting | one subagent: **172 typechecks, 58 full `check` runs, 0 commits** in 40.8 h |
| Scheduled napping | `for i in $(seq 1 9); do sleep 60; done; git log …` run **37×** by the coordinator ≈ 5.5 h of sleeping inside tool calls |
| Session length | 8 sessions/lanes past 24 h of span; the 3 h / ~400-turn rule in CLAUDE.md was exceeded by every long lane |
| Checks as a tic | per-session `check` counts of 63, 58, 55, 43 — mostly on trees whose inputs hadn't changed |

Two per-session details worth keeping: `-Users-r/sub-985c9fe3` (the modeling
coordinator): 76 commits, 55 checks, 71 typechecks, 17.8 h. `agent-ae`:
174 screenshots into its own context (64 MB) while iterating on
`rig/Materials.ts` — the capture-look loop belongs in short-lived context,
not accumulated for 26 h.

Conclusion for the plan: the top lever is **context discipline** (short
sessions, capture-look loops in disposable subagents, crops instead of full
frames, batch turns), ahead of any individual tool getting faster.

---

# Third pass: every tool benchmarked, one at a time, quiet-ish machine

2026-08-24 evening, HEAD, warm daemon, serial runs. Raw:
`project/audits/2026-08-24-tool-bench.csv`. Caveat: one co-agent was
intermittently active; an external SIGTERM killed the first run mid-combatloop
(resumed), and perf/gameplay queued behind a co-agent's gameplay run.

## The >30 s offenders (everything else is already fast)

| tool | standalone | inside `check` | verdict |
|---|---|---|---|
| perf.mts | 704 s (incl. queue; run VALID) | — | by design (full sweep); needs `--quick` + sha cache |
| check.mts full | **535 s**, 17/17 PASS | — | serial sum of gates; parallelise + cache |
| reachcheck | **263 s** | **76.6 s** | worst node-only tool; `farSeat` executed 5 516× — sampling budget |
| uxcheck | **151 s**, rc=1 (page closed mid-run) | PASS | slow + fragile standalone; investigate |
| floatcheck | **96 s**, rc=1 (throws) | **13.8 s** PASS | standalone path is broken/7× slower — env-dependent |
| combatloop | 87 s | (in 17/17) | 31 scenarios serial on one page |
| gameplay.mts | 76 s, VOID (noisy machine) | — | void logic worked as designed |
| driftcheck | FAIL @ 10 s (`--only`) | PASS @ 54.7 s | standalone/in-check inversion — same class as the gate-run handoff |
| integration | 40 s, rc=1 standalone | PASS | red standalone, green in suite |

## Everything under 30 s already (no benchmaxx needed)

vite build 2 s warm; typechecks 2–3 s cold; anycheck/orphans/geocheck ≤ 3 s;
silhouette 11 s; hydrocheck 14 s; silrocks 22 s; roadcheck 16 s;
creaturecheck (207 poses) **17 s**; heightcheck 12 s; horizoncheck < 1 s;
imgdiff/imagestats ≤ 1 s; all CLIs ≤ 1 s.

**Capture path is healthy on a quiet machine:** shoot 1-shot 19 s first,
**1 s cache-hit**, **5-shot batch 21 s** (~4.2 s/shot), `--cold` 23 s. The
48 h average of 38.9 s was contention + one-shot-per-call habits, not the tool.

## Findings that are content, not harness

- **perf: town_forecourt at 46 fps** vs the 60 fps target (valid run,
  RULER_VALID true) — a real regression for whoever owns perf next.
- floatcheck/integration/driftcheck disagree between standalone and in-suite
  invocation. Until diagnosed, a red standalone gate is not evidence — run it
  via `check.mts --only <gate>` before believing either colour.
