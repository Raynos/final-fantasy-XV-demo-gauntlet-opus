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
