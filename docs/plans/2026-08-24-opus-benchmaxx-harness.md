# Benchmaxx: make the loop fast, not the agents patient

Status: PROPOSED (2026-08-24, opus; revised same day after the second-pass
audit and the human's decisions). Evidence:
`project/audits/2026-08-24-toolcall-wallclock.md` (two measured passes over
48 h of transcripts) and `project/journal/2026-08-23-harness-bench.md`.

Decisions already taken by the human (do not re-litigate):
- Poll-loop ban is a **hard-block hook, with a last-resort escape hatch**.
- Gate-result cache keys on the **full tree sha only** (input scopes rejected:
  an under-declared scope is a gate that silently stops running).
- This session writes the plan; **implementation is a fresh lane's job**.

## The measured shape

48 h of transcripts: 45.5 h tool wall-clock, ~53–61 h model gap, 3.78 M output
tokens — and **3.18 B cache-read input tokens**. The gap decomposition says
generation explains only ~525 of ~3 177 gap-minutes; the rest is per-turn
overhead (TTFT on 300–530 k-token contexts, ~11.6 s/turn × 13 742 turns). So
the model isn't slow because it thinks hard (thinking = 14 % of output); it's
slow and expensive because **enormous contexts are re-read every turn of
enormously long sessions**. Context size is the tax on everything; wall-clock
sinks (poll loops, cold boots, cold tsc) multiply it by adding turns.

## Top 10 fixes, ranked by measured impact

| # | fix | evidence | expected win |
|---|---|---|---|
| 1 | **Context discipline: hard session caps.** End a lane at ~3 h / ~150 turns and respawn from the handoff (which CLAUDE.md already mandates and every long lane ignored — 8 lanes past 24 h, 1 000+ turns). A respawned lane restarts at ~30 k context instead of dragging 500 k. | 3.18 B cache-read tokens; 356 M in one session | **~2–3× token spend**, plus faster TTFT every turn |
| 2 | **Capture-look loops in disposable context.** The look-tweak-look cycle (48 recaptures of one shot; 174 images in one agent's context) runs in a short-lived subagent that returns a verdict, or after crops — never 48 full frames accumulated in a 26 h context. Add to CLAUDE.md; enforce by convention + review. | 1 359 images / 520 MB carried; same-shot counts 48/47/27/25 | large token + TTFT win, fewer polish spirals |
| 3 | **Poll-loop ban (hard-block hook + escape).** PreToolUse hook rejects `sleep`-in-loop / busy-wait Bash; message says use `run_in_background`. Escape of last resort: `CC_ALLOW_POLL=1` prefix (logged, so abuse is auditable). | 617 min Bash:other; 37× nine-minute sleeps; 600 s timeouts | ~8 h/48 h + the turns those waits burned |
| 4 | **Prewarm on commit.** post-commit hook → daemon `/prewarm`: materialise sha + boot a page in the background while the agent writes prose; evictable the instant a fix lease wants the slot. Bump `PROTOCOL`. | shoot avg 38.9 s vs 2.3 s warm render, 864 calls | ~5 h/48 h, median shot <8 s |
| 5 | **Incremental tsc.** `"incremental": true` + `tsBuildInfoFile` in `node_modules/.cache/tsbuildinfo/` (shared trunk: one shared file, keyed on content, safe). Pre-commit drops ~20 s → ~3 s. | 1 005 typechecks = 107 min; embedded in 891 git calls (353 min); one agent ran 172 typechecks | ~4 h/48 h |
| 6 | **Gate-result cache, full-tree sha.** `check.mts` stores `{gate, sha, verdict}` in `~/.cache/ffxv-harness/gatecache/`; same-sha re-run replays in ~1 s. Kills the check-as-a-tic habit (63/58/55 runs per session, mostly unchanged trees; 172-typecheck-0-commit babysitting). | 57 full runs avg 124.6 s; per-session check counts | ~2 h/48 h + removes a whole agent behaviour |
| 7 | **Parallel browser gates + shard creaturecheck.** Run integration/uxcheck/creaturecheck/combatloop/roadcheck through the daemon sweep lane concurrently (4 slots); shard the 207 poses across the pool. | serial suite wall time; 4 slots idle during check | full cold `check` ≈ 3 min → ~1 min; narrow edit ≤ 60 s |
| 8 | **Batch turns and batch shots.** One turn issues typecheck + shoot batch + git status together; one shoot invocation carries all names (`shoot.mts a b c` already works). This attacks the ~11.6 s/turn overhead directly: fewer turns, same work. | 13 742 turns × 11.6 s overhead ≈ 44 h | tens of hours across lanes |
| 9 | **perf/gameplay hygiene.** Cache verdicts by sha (same store as #6), add `--quick` (half segments/dwell, validated once against full), default `--deadline` so a busy machine 429s in seconds instead of queueing 10 min. | perf 227 min + gameplay 46 min; 601 s queue rows | ~2 h/48 h, honest perf numbers |
| 10 | **Boot diet: 9.2 s → ~4 s, RSS 1.4 GB → <800 MB.** bootprof-led; `?shoot=1` skips audio/input/UI/minimap warm-up; daemon `/health` warns when the painted-face cache is missing (silent 6.9→9 s today). Re-measure the two-boot determinism floor (1.493/255) after every cut; any cut that moves it reverts. | boot 9.2 s multiplies every page boot in #4/#7; TODO.md's two complaints | multiplies 4 and 7; fixes both TODO items |

Ranked out of the top 10 but kept: a CLAUDE.md rule that mechanical lanes
(corpus capture, log grepping, retry verification) run on cheaper/faster
models, with Opus reserved for judgement calls (blind A/B, diagnosis) — real
but unquantified here; and `--jpeg` stays the review default (already the
rule, keeps transcripts small).

## Phase details

### Poll-ban hook (fix 3)

`settings.json` PreToolUse hook on Bash. Reject when the command matches
`(for|while|until)[^\n]*\bsleep\s+\d+` or `while\s*\(.*Date\.now\(\)\s*<` —
unless the command starts with `CC_ALLOW_POLL=1` (the escape; each use lands
in the hook log). Rejection message, verbatim: *"Poll loops are banned: run
the slow command with `run_in_background: true` — you are re-invoked when it
exits. Escape hatch of last resort: prefix `CC_ALLOW_POLL=1`."* A bare
`sleep N` (N ≤ 5, no loop) passes. Hook edits need a session restart to take
effect — note it in the rollout commit.

### Prewarm route (fix 4)

`POST /prewarm {sha}` → materialise tree (~0.75 s), boot one `?shoot=1` page
to `GAME.ready`, park it. Constraints: counts against `BROWSER_BUDGET`;
evicted (page closed, not reused) the moment any fix-lane lease needs the
slot; at most one prewarm outstanding, newest sha wins; no-op when the sha's
frame-cache already has the requested shots. Wire: `.githooks/post-commit`
fire-and-forget curl. Bump `PROTOCOL`.

### Gate cache (fix 6)

Store per `{gate, treeSha}`: verdict, one-line summary, duration, timestamp.
`check.mts` prints the same table with `cached` markers and a
`--no-cache` override. Invalidation is trivial by construction: any commit
changes the sha. Perf gates (#9) reuse the same store but also record the
machine-quiet flag; a verdict taken non-quiet is never replayed as a pass.

### Session caps (fix 1) — the only genuinely new policy

CLAUDE.md already says 3 h / ~400 turns; the audit says every long lane blew
through it. Make it structural, not aspirational:
- Coordinator prompts must include the cap and the respawn instruction
  (fresh agent, read handoff, continue) — respawning is cheap *because*
  handoffs are already mandatory and current.
- Drop the turn guidance to **~150 turns** for worker lanes: past that, the
  context is mostly stale capture history. (The 400 figure predates these
  token numbers.)
- The coordinator polls less (fix 3 removes its sleep loops) and delegates
  look-loops (fix 2), which is what made its own context balloon.

## Sequencing

1+2+3 are policy/hook work (~2 h total) and pay immediately; do them first.
5 is an hour. 4 and 6 are the daemon/check work (~1 day together). 7 rides on
6's plumbing. 9 is half a day. 10 is profile-led game work (1–2 days) and the
only phase touching `src/` outside tools — do it once, after bootprof names
the top sinks.

**Definition of done:** re-run both audit scripts after two working days of
agent traffic. Done when: tool wall-clock ≤ 15 h/48 h with the same gate
roster; no 600 s poll rows; cache-read tokens ≤ 1 B/48 h; no session over
4 h span or 250 turns; median shoot call ≤ 8 s; same-sha `check` ≤ 5 s.
