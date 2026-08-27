# Seven days of wall-clock, and what "waiting" turned into

2026-08-27, fable. Source: every transcript under `~/.claude/projects/<this
repo>/` modified in the last 7 days — 203 jsonl files, 2.1 GB. Method: same
tool_use→tool_result pairing as the 08-24 audit, plus three passes that audit
did not have: a **cross-session overlap** measure on every daemon-touching
call, **marker mining** of result text, and a first/second-half split at
~08-24 04:00 (the plan's own date). Scripts: `audit7-wallclock.mjs` and
`audit7-tokens.mjs`, beside this file. Re-run them before extending anything.

## Headline

| bucket | 7 days |
|---|---|
| tool calls measured | 22 808 |
| tool wall-clock | **4 282 min (71.4 h)** |
| Bash calls foreground / background | 18 097 / **381** (2.1 %) |
| poll-shaped commands (sleep-in-loop, until-grep, big sleeps) | **327** |

The 48 h audit measured 45.5 h of tool wall-clock; the last 48 h of this
window runs at roughly 13–14 h — but turn volume also collapsed (6 944
turns on 08-23 against 229 on 08-26, 1 199 on 08-27) as phase 4 closed, so
most of that is less work being asked for, not faster work.

## The waiting morphed. It did not die.

The 08-24 plan's fix 3 (poll-loop ban) was never implemented — no hook, no
`CC_ALLOW_POLL`, nothing in `.claude/hooks/`. What happened instead, first
half → second half (per-half activity fell ~3.7×; judge the absolute rows
against that):

| shape of waiting | first half | second half |
|---|---|---|
| `Bash:other` (the 08-24 audit's poll bucket) | 764 min | **24 min** |
| `Bash:sleepish` (sleep/until loops the old category split out) | 143 min | **173 min** — *up*, despite 3.7× less activity |
| `TaskOutput` used as a 10-minute blocking wait | 0 | **234 min** (34 calls, avg 413 s, one coordinator, all 08-27) |
| `daemon.mts` health polls | 43 min | **61 min** |

Poll loops were still being written on 08-27, the newest day in the window:
`until grep -q "gates passed" …; do sleep 20`, `while [ ! -f tmp/draws-before.json ]; do sleep 15`,
`for i in $(seq 1 60); do [ -f .git/index.lock ] || break; sleep 10`,
`until pnpm run typecheck >/dev/null 2>&1; do sleep 30; done` — that last one
re-runs the *whole typecheck* as its poll body. Sum the second half's explicit
waiting (sleepish + TaskOutput blocks + health polls) and it is **~468 min in
3.5 days** — about a third of all second-half tool wall-clock, in a window
where the old poll bucket looks cured.

The lesson is structural, not moral: agents poll because **nothing here can be
waited on**. The daemon queues silently (a blocked HTTP call prints nothing),
background tasks are watched by grepping their log files, git's index lock has
no queue, and `TaskOutput` will happily block for 600 s and call it a tool. A
syntax ban alone moves the pattern to the next syntax; the fix has to ship the
wait primitive first and ban the workaround second.

## Queue wait vs. CPU-bound run: now measurable, and measured

The daemon writes no ledger and its autostart uses `stdio: 'ignore'`
(`daemon.mts:452`), so every queue/lease log line it prints is discarded, and
a slow tool call cannot say *why* it was slow. To decompose anyway: for every
daemon-touching call, count concurrent daemon-touching calls from *other*
sessions during its span, then compare medians.

| tool | median solo | median contended | reading |
|---|---|---|---|
| longplay probe | 421 s | 412 s | **pure CPU** — contention does not touch it |
| check (full suite) | 420 s | 434 s | **pure serial CPU** — 18 gates, one at a time |
| perf.mts | 49.7 s | 132.7 s | 2.7× — mostly waiting for the quiet lane |
| combatloop | 16.4 s | 95.8 s | 5.8× — queueing behind leases |
| driftcheck | 3.4 s | 61 s | 18× — ditto |
| shoot.mts | 17.5 s | 28 s | boots + queue share |
| imgtools | 2.9 s | 16.4 s | pure queue (no browser work of its own) |

Summing median inflation × contended-call counts across categories: **queue
contention costs ~2.5 h/week**. Real, but a fraction of the ~8 h/week of
self-inflicted waiting above, and far less than the serial gate suite. The
queue's true cost is being **invisible**: it is why agents poll `/health` (280
calls, 104 min), why a 600 s `--wait-lease` block reads as a hang, and why the
08-24 audit needed transcript archaeology to say any of this. TIMINGS.md's
quiet-vs-busy gate rows (reachcheck 77→49 s, drawcheck 281→146 s) corroborate
the split from the other direction.

## Long runs, recent and less recent

- **Less recent (08-21..24):** the 94-minute `git reset --hard`
  (agent-a2, 08-21 — the index-lock story `agentstats.mts` still tells);
  ten-minute `perf`/`check` runs wrapped in `pgrep … sleep 30` babysitters;
  a literal busy-wait `node -e "while(Date.now()<t);"` inside a 10-loop.
- **Recent (08-26..27):** longplay's 30-minute sessions (legitimate — and
  five of them died at 14.5–14.9 wall-minutes to the 15-min lease TTL before
  `probe.mts --ttl` landed); fightshape/drawcheck/check runs at the full
  600 s Bash timeout; fourteen 10-minute blocking `TaskOutput` calls in one
  coordinator; `.git/index.lock` spin loops around commits.
- **git is the second half's #1 sink**: 264 min over 262 calls (~60 s avg)
  against a 1.4 s pre-commit gate — index-lock contention between concurrent
  lanes, spin-loop wrappers, and the pre-push gate roster.
- 16 calls died at the 600 s Bash timeout (114 min); 21 results carry
  *"Execution context was destroyed"*; `run_in_background` was used on 2.1 %
  of Bash calls.

## Tokens: volume fell, discipline did not land

Per-day (all sessions + sidechains, deduped by message id):

| day | turns | cache-read | per-turn context | avg gap |
|---|---|---|---|---|
| 08-21 | 4 759 | 783 M | ~165 k | 54.9 s |
| 08-23 | 6 650 | 1 481 M | ~223 k | 18.1 s |
| 08-25 | 539 | 129 M | ~239 k | 18.5 s |
| 08-27 | 1 153 | 319 M | **~277 k** | 10.3 s |

Total cache-read fell 1.5 B/day → 0.3 B/day **because turn count fell**.
Per-turn context is flat-to-worse, and per-turn gap (~10–13 s) matches the
48 h audit's ~11.6 s overhead figure. The 08-24 plan's fix 1 (150-turn caps,
respawn from handoff) was never written into any doc; CLAUDE.md still says
~400 turns.

## Scorecard: the 08-24 plan's own definition of done, today

| criterion | verdict |
|---|---|
| tool wall-clock ≤ 15 h/48 h | ~13–14 h in the last 48 h, **but at 3.7× lower activity** — not earned |
| no 600 s poll rows | **FAIL** — present on 08-27 |
| cache-read ≤ 1 B/48 h | pass by volume collapse, not by discipline |
| no session over 4 h / 250 turns | **FAIL** — the 08-27 coordinator alone spans 5+ h |
| median shoot ≤ 8 s | **FAIL** — second-half avg 32 s |
| same-sha `check` ≤ 5 s | **FAIL** — no cache exists |

None of the ten fixes was implemented (survey of 105 commits since 08-24:
zero touch them). What *did* improve arrived from elsewhere: native tsc 7.0
(typecheck 6.4 s → 0.39 s, landed 08-22), phase 3's boot work (13.7 → 6.6 s
cold), the exclusive-lease FIFO + `--wait-lease` (08-25), HMR off (08-27),
`probe.mts --ttl` (08-27). The plan that acts on all of this:
`docs/plans/2026-08-24-opus-benchmaxx-harness.md` (rewritten 2026-08-27).
