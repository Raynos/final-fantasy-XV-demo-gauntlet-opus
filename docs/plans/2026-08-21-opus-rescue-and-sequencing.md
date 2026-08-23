# Rescue and sequencing plan

Status: IN-PROGRESS (2026-08-23, opus). The rescue itself is closed and its
ledger archived at `project/archive/RESCUE-2026-08-21.md`. This file survives as
the agreed *sequence*, and nothing else — **it is not a record of work and it is
not a tracker.** Read it for the order and the reasoning; read the phase plans
for what is actually built.

- **Phase 1 (rescue)** — CLOSED, ledger archived.
- **Phase 2 (TypeScript)** — **DONE and verified**: `anycheck` 0 `any`,
  `tsc -p tsconfig.json` and `-p tsconfig.tools.json` both clean, and both run
  in the pre-commit hook. Plan graduated to
  `project/archive/plans/2026-08-22-opus-phase2-typescript-port.md`.
- **Phase 3 (boot and memory)** — open, most of the way, misses its own target.
- **Phase 4 (content and gameplay)** — open, real code landed, definition of
  done unevidenced.

§3's determinism table below is **superseded** — see the note under it.

**Written 2026-08-21.** The order of work from here, agreed with the human, and
the reasoning behind that order.

Companion documents: **`project/archive/RESCUE-2026-08-21.md`** is the item-by-item ledger of what
the force-killed session left behind — this file is the *sequence*, that file is
the *contents*. `project/STATUS.md` is the live snapshot.

---

## 0. Why this plan exists

Coordinator session `07642602` ran seven subagents and reached ~3 GB RSS with an
~80 MB transcript before it became unusable. It was force-stopped along with
every agent under it, after each was told only to "hand off and prepare to
exit". No *committed* work was lost — all seven branches had merged and every
worktree was pruned — but everything still in a head was.

`project/archive/RESCUE-2026-08-21.md` reconstructs that from the handoffs and, critically,
**reconciles each claim against what is actually on `main`** rather than
trusting the docs. Seven items turned out to be already landed; roughly sixty
were genuinely abandoned.

## 1. The order, and why

The human's sequence, in their words: rescue and finish the abandoned work →
TypeScript → their own `TODO.md` items → the content/gameplay plan.

**1. Rescue (`RESCUE.md` B1–B14).** First because everything else compounds on
top of it. Half of it is not new work at all but *verification debt* — code that
shipped to `main` unverified, most sharply `agent/idles`, whose posture system
touched every character in every frame and had never been looked at.

**2. TypeScript port** (`project/archive/plans/2026-08-17-opus-typescript-port.md`). Second
because **its cost scales with the size of the codebase, and step 4 grows the
codebase substantially.** The port is a whole-repo lock — it cannot run as the
parallel-agent wave that built everything else here — so it wants one dedicated
session on a quiet tree. Doing it after the content work means porting a much
larger codebase, in exactly the layer (`rpg/**`, the combat event map, `Shot`)
where the plan argues the type value is highest.

> The plan was **stale on scale** and this note was too: the plan said 235
> modules / ~79,500 lines, this note said 274 / ~94,900, and as of 2026-08-23 it
> is **291 modules / ~143,000 lines** (`orphans` counts 291 reachable). It grows
> ~5k lines a session. Historical only — the port is done; keep the number
> honest because other estimates cite it.

**3. The human's `TODO.md`.** Boot time ("starting a new page takes forever") and
memory ("1.4 GB of RAM in `?debug` and maybe in prod too"). Deliberately *not*
first, at the human's instruction. The third item, "repo feels chaotic", was
resolved on 2026-08-21 by a separate session.

**4. Content and gameplay**
(`project/archive/plans/2026-08-17-opus-content-gameplay.md`, archived; the
execution plan that replaced it is
`docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md`). The largest remaining body of
work and the one that changes what the demo *is* — its load-bearing finding is
that the game is visually deep and mechanically stubbed, with encounters still
"currently a photo booth".

## 2. How the rescue is being executed

Agreed division: **serial by the coordinator wherever possible**, with worktree
subagents dispatched immediately for items whose scope is genuinely large.

Serial (coordinator): determinism, the weapon and combat fixes, cutscene
staging, unviewed zones, the hygiene list, and all the doc/state cleanup.

Parallel (worktree agents, capped at ~4): the 17 remaining enemy species, the
whole `src/ui/**` pass including the `combatloop` regression, trees and bushes,
and the hero face/hair/skin/outfit work.

**Concurrency is capped at ~4 on measured grounds.** Six or more headless
Chromiums saturate the machine, make every measurement worthless, and stall
agents outright — that is how the previous round lost three of them.

## 3. What has landed so far

Each verified by eye or by measurement. Detail in `project/STATUS.md`.

- **`Party.snap()`** and its call from `Game.applyShot`. `Animator.rest()` had
  existed with zero callers.
- **`Director.setScenario` no longer early-returns** when the scenario name is
  unchanged — that early-out made consecutive `field` shots skip the reset
  entirely and inherit the previous shot's drift. This was the larger half of the
  determinism bug and was *not* in any handoff.
- **`resetClock()` per shot rather than per page.**
- **Noctis is right-handed**, with the weapon anchor's rotations mirrored to
  match, and **his fist now closes** (`setGrip` had no caller on the player path).
- **Blades read as steel** instead of flat navy planes.
- **`cine_opening` pushes the visible Regalia** rather than empty air.
- `SESSION-STATE.md` rewritten; `claude-resume.md` deleted; `MapRaster.ts`
  deleted by a peer session (`orphans.mts` was clean at 272/272 for the first
  time; it is 291/291 as of 2026-08-23).

### The determinism result, with its control

Same `follow` shot alone versus sixth in a batch, mean delta per 255:

| state | delta |
|---|---|
| before | **39.200** |
| after `Party.snap()` | 4.672 |
| after per-shot `resetClock()` | **2.068** |
| control: two identical alone-runs | **0.305** |

**The control is the point.** This shot's true noise floor is 0.305, not the
1.5–1.9 quoted for the corpus generally — so 2.068 is still real
order-dependence, roughly 5% of pixels over 8/255, most likely vegetation tile
streaming. A 19× improvement with stable framing, but **not closed**.

> **SUPERSEDED 2026-08-22 by `417ca86`, and the guess in the last sentence was
> wrong.** Determinism is now **CLOSED**: 1.836 -> **0.340** mean/255 against a
> measured 0.302 floor. The residual was **the wind**, not vegetation streaming
> — `Weather.resetClock` set only `_snap`, while `_gust` integrates forever and
> `windDir` drifts permanently, so no preset change and no clock reset ever
> touched them. Wall-clock streaming budgets were a real second cause but worth
> only 0.009/255; what they bought was machine-independence, not the number.
> The lesson recorded in §4 ("control before concluding") held. The lesson it
> did *not* record, and should have: **pin every integrated phase, not the ones
> a handoff happens to name.**

## 4. Lessons being carried forward

- **Commit early and often, even unverified `WIP:` commits.** Three agents
  stalled last round with uncommitted work; three more stalled this round when
  the laptop slept. The difference was that this round's agents had been told to
  commit constantly, so the salvage cost one command per worktree instead of an
  afternoon. This is now the single highest-leverage instruction in an agent brief.
- **A stalled agent's transcript may be unrecoverable, but its branch is not.**
  Re-dispatch a fresh agent whose *first command* is
  `git merge --no-edit worktree-agent-<id>`, and tell it plainly which of the
  inherited commits have never been looked at.
- **Control before concluding.** The determinism work would have been declared
  finished at 2.068 against a remembered 1.5–1.9 floor. Measuring the actual
  floor for that shot showed it was 0.305 and the job was not done.
- **Verify handoff claims against source.** Seven items in `RESCUE.md` §A were
  already fixed; several others were reported as applied but were not.
