# Process lifts from kami-kakushi — the five no-brainers

Status: 📋 PROPOSED (2026-08-21, opus). Nothing here changes game code.

Audit of `../../games/kami-kakushi` (1796 commits, 219 sessions) for process we
should steal. It is a genuinely more mature agentic setup than ours in a few
narrow places and *far* heavier everywhere else. This plan takes the five cheap
wins and explicitly names what we are refusing, so a later session doesn't drift
into copying the rest.

## What that repo actually is

| | kami-kakushi | here |
|---|---|---|
| always-loaded agent doc | `AGENTS.md` 500 lines + `@docs/repo-map.md` 250 more | `CLAUDE.md` 95 lines |
| markdown files (excl. node_modules) | 3307 | 176 |
| session journal entries | 250 | 1 dir |
| skills | 30 (~6500 lines of SKILL.md) | 1 |
| PreToolUse/Post hooks | 6 | 0 |
| verify gates | 22, rostered in `src/scripts/gates.ts` | 1 (`vite build`) |
| human queue files | 5 (`todo-human`, `decisions`, `review.md` @ 88 KB, `BACKLOG`, `archive.md`) | `project/TODO.md`, 5 lines |

The diagnosis in the ask is right. That doc is an **Opus-4.6-era artifact**: it
assumes the model needs every rule restated in prose, in context, every turn —
so it grew a ~50 KB always-loaded preamble, 30 opt-in skills that mostly restate
the same principles, and an append-only-lossless record that has to be actively
gardened. Roughly 250 lines of `AGENTS.md` are *narration of a rule* rather than
the rule, and several of its own gate comments admit the prose rung failed
("a standing rule buried in a never-invoked skill doesn't fire").

But the parts of it that work are exactly the parts that **are not prose**: the
six executable guards and the 22 gates. Their own principle says so, and it is
the single best line in the repo:

> Push each quality rule to the highest rung that can *soundly* hold it — a
> gate > a hook > a skill > a written norm, calibrated so a gate never cries
> wolf.

That is what we take: the rungs, not the prose. Every item below is a script or
a one-line convention, not a paragraph in `CLAUDE.md`.

## The five

### 1. Shared-index guard hook — `.claude/hooks/guard-git-add-all.sh`

**Why now.** We already know this hazard — it is one of two facts in this
session's memory ("concurrent sessions commit from one checkout; stage explicit
paths, never `git add -A`") — and we enforce it with nothing but good
intentions. kami has a battle-hardened `PreToolUse(Bash)` hook that blocks
`git add -A/./-u`, `git commit -a/-am`, a bare `git commit` with no `--
<pathspec>`, and `git add` of an already-tracked file. Its header cites two
commits where the unguarded version swept a co-agent's staged work.

**Do:** copy the script verbatim, drop the ledger/`HERDR_PANE_ID` lines, wire it
in `.claude/settings.json` (we currently ship only `settings.local.json` with an
output style — the hooks block is new). Keep `SKIP_SWEEPGUARD=1` as the escape.

**Cost:** ~90 lines, one settings block. **Risk:** false-blocks on exotic
compound commands; escape hatch covers it.

### 2. A `SessionStart` brief

**Why now.** We have `project/HANDOFF.md`, `SESSION-STATE.md`, `PROGRESS.md`,
`RESCUE.md` and `TODO.md` — 1030 lines of state that a cold agent only reads if
it thinks to. kami's `src/scripts/session-brief.sh` is a pure-read script wired
to `SessionStart` that prints the human queue + active plans + recent commits
straight into context. Cold pickup stops depending on the agent's curiosity.

**Do:** `src/tools/brief.sh` — under 60 lines, ≤2 s, no `git log` over a long
range:
- unticked `- [ ]` items from `project/TODO.md` (human-written, we never tick),
- every `docs/plans/*.md` whose Status token is not `DONE`/`SUPERSEDED` (see 4),
- the `SESSION-STATE.md` ownership table's first screen,
- last 5 commit subjects.

Explicitly **not** taking kami's version of this: theirs runs a herdr socket
call, an inbox scan, and a MUST-RELAY-VERBATIM shouting match with the agent
because agents kept dropping a line from the relay. That is a prose fix for a
prose problem.

### 3. Line-cap budgets on the always-loaded docs

**Why now.** kami's `verify-doc-budgets.ts` exists because their status snapshot
bloated to 326 lines by pure append. Ours is heading the same way: `RESCUE.md`
is already 395 lines and `PROGRESS.md` 232, and the human's own `TODO.md` says
*"Repo feels chaotic, with too many top level files."* A hard cap turns append
into **displace** — to add a line you must cull a weaker one.

**Do:** add to `.githooks/pre-commit` a ~20-line check over a small table:
`CLAUDE.md` 120 · `BRIEF.md` 150 · `project/SESSION-STATE.md` 150 ·
`project/HANDOFF.md` 250. Warn at 85 %, block at the cap, `SKIP_DOCBUDGET=1`
escapes. Skip the "genre leak" regexes — that is their journal problem.

### 4. A closed Status vocabulary on plans, and archive-when-done

**Why now.** This was our live bug. `docs/plans/` held
`2026-08-21-harness-daemon.md` *and* `2026-08-21-opus-harness-daemon.md` — two
overlapping plans from the same day, one missing the model prefix we adopted
three commits ago (since merged into the prefixed file) — and **not one of our
five plans states whether it is proposed, in progress, or already built**. A reader cannot tell live work from
landed work without opening all five.

**Do:** two conventions, both enforceable in the same pre-commit block as 3:
- Every plan's first non-heading line is `Status: <TOKEN> (<date>, <model>)`
  with TOKEN from exactly six: `PROPOSED · LOCKED · IN-PROGRESS · DONE ·
  PARKED · SUPERSEDED`. Warn (not block) a new `docs/plans/*.md` without one.
- `DONE`/`SUPERSEDED` moves to `project/archive/` (new dir), so `docs/plans/`
  lists only live work — which is what makes item 2's brief honest.

Backfill the five existing plans. The two harness-daemon files are already
reconciled; the merged plan carries the first `Status:` line, with Decision 1
(drop worktrees) marked `LOCKED`.

### 5. "If it isn't in the queue, it doesn't exist"

**Why now.** kami's sharpest finding, from a real failure (their session 183
recorded a human ruling in an ADR, the snapshot, the journal *and* a review item
— every place except the one an agent picks work up from, and it was never
built). The human's verdict: *"if it's not in `docs/plans/` it will be lost."*
We have the identical exposure: deferred work here lands in `HANDOFF.md`
prose and `RESCUE.md` sections, neither of which any agent treats as a queue.

**Do:** one sentence in `CLAUDE.md` — *work you ruled, discovered, or deferred
but did not build gets a `docs/plans/` file or a `project/TODO.md` line; a
handoff note and a journal entry are a record, not a queue* — plus the norm that
a shouted `NOT BUILT` in any doc names its home. Take the **norm**, not their
`verify-deferred-work.ts` gate: at 176 markdown files we do not have the
false-positive surface that made a gate worth 100 lines of calibration.

## Explicitly refusing

Named so a future session doesn't rediscover them as "good ideas":

- **30 skills.** Most of kami's are a domain doc wearing a skill's frontmatter
  (`kami-domain-reference`, 357 lines; `kami-narrative-grammar`, 459). Opus 5
  reads a doc when pointed at one. We keep skills for *procedures with tools*.
- **Journal-per-session** (250 files) and **append-only-lossless everywhere**.
  Git log is the lossless record. Our `project/journal/` stays optional.
- **The HD/HR ledger apparatus** — `human-in-the-loop/review.md` is 88 KB. One
  `TODO.md` the human writes in is the right size for this project.
- **ADR numbering.** kami is at ADR-201 and cross-references them constantly;
  half of `AGENTS.md`'s authority is "(ADR-nnn)". Decisions belong in the plan
  that made them.
- **`@`-including a 250-line repo map into always-loaded context.** A `docs/`
  tree the agent can `ls` costs nothing per turn.
- **The 72-char markdown prose-width `PostToolUse` hook**, the verify-budget
  timers, the milestone-integrity gate, the taste-scorecard 21-principle walk.
  All real engineering; all load-bearing only at their scale.

## Worth stealing later, not a no-brainer

**The `diverge` discipline** (ADR-075): no new UI surface ships from a single
idea — build 2–3 *working* variants, wire them into a DEV-panel toggle, let the
human compare them live, ship only the default (zero prod flag debt). We have
the substrate for this already in `?debug` and the dev suite. It is the one
heavyweight thing in that repo that would plausibly raise the ceiling here.
Deliberately out of scope for this plan.

## Order

1 (guard) → 4 (plan status + archive, backfill) → 2 (brief, depends on 4) →
3 (budgets) → 5 (one sentence). Items 1–3 are one small commit each; 4 is a
commit plus a backfill commit. Whole thing is an afternoon, and every step is
independently revertible.
