# Phase 4 — content and gameplay

The largest remaining body of work, and the one that changes what this demo *is*.

**This is the execution plan. The argument and the audit live in
`docs/plans/2026-08-17-opus-content-gameplay.md`** (985 lines) — its workstream
definitions, its FFXV reference appendices and its case for what to cut are all
still correct and are not repeated here. Read it first. This document says what
has changed since it was written, what order to actually run the work in, and how
to parallelise it.

Status: LOCKED (2026-08-22, opus) — phase 4 of `2026-08-21-opus-rescue-and-sequencing.md`.
Planned, not started. Runs after phase 2 (TypeScript) so the new
systems are written in TS rather than ported afterwards.

---

## 1. The finding that still governs everything

From the audit, §1.2, and it has not changed: **the game is visually deep and
mechanically shallow.** Encounters are, in the audit's phrase, "currently a photo
booth". Five rounds of agent work since have made it look substantially better and
have not moved that at all — today's session was almost entirely rendering and
correctness.

The target is unchanged: **a 30-minute playable slice** that a person can sit down
with, not a corpus of 139 handsome stills.

## 2. What has changed since the audit was written

| the audit assumed | now |
|---|---|
| No way to look at the game except a 20-minute batch capture | **An in-game dev suite exists** — console, freecam, asset browser, review inbox (`?debug=1`). This changes iteration cost for gameplay work more than for art work, because gameplay defects are behavioural and a still frame cannot show them |
| WS-0a "shader pre-warm and the magic crash" was BLOCKING, ~1 day | **Done.** The warmup exists and pins the light budget; the 15.8 s freeze is gone. What remains is that warmup costs 1722 ms of boot — that is **phase 3's** problem, not a blocker here |
| Perf unknown | **Measured on a quiet tree:** `perf` worst 37.9 fps (`vista_dawn`), `gameplay` worst 49.8 fps (`walk`). Both fail the 60 fps target and **nobody owns them** |
| `combatloop` failing | **30/30.** It was a stale test, not a broken game — the mechanics it covers were working all along |
| Character art "below AAA at closeup" | Improved but honestly still short: hands are mittens, outfits are flat black, hair reads as quills |

**The `combatloop` correction matters for scoping.** It verifies 30 combat
mechanics — companion techniques, energy draw, spell craft and cast, raw elemancy,
nameplate HP, damage numbers, the Armiger gauge, EXP on kill. Those are *wired and
provably reachable*. The audit's picture of how stubbed the game is was drawn when
that gate was misreporting. **Re-audit against `combatloop` and `integration`
before planning WS-1**, or you will rebuild things that already work.

## 3. Order of work

The audit's dependency graph holds. The revision is that WS-0a is done and WS-0b
has become a named, measured, unowned problem.

| # | workstream | depends on | notes |
|---|---|---|---|
| **0** | **Re-audit against the gates** | — | Half a day. What does `combatloop` 30/30 + `integration` 18/18 actually prove is reachable? Cut WS-1 down to what is genuinely missing |
| **WS-0b** | **Rendering performance** | — | Now concrete: `vista_dawn` 37.9, `walk` 49.8. Runs parallel, whole-run. **Assign an owner** — it has never had one |
| **WS-1** | **The wire**: RPG ↔ UI ↔ combat ↔ world | 0 | Still the first content workstream. Scope it from the re-audit, not from the original list |
| **WS-2** | Encounters, party combat AI, death | WS-1 | The "photo booth" fix |
| **WS-3** | Hammerhead, NPCs, the interaction verb | WS-1 | The first place a player stands still and *does* something |
| **WS-4** | Quests and hunts | WS-1, WS-3 | |
| **WS-5** | Camp, cook, rest, day cycle | WS-1, WS-3 | |
| **WS-6** | The Regalia | WS-1, WS-3 | Note `SHOT_STAGES` and the two-Regalia trap in `project/handoff/cineui.md` §6.3 |
| **WS-7** | Character fidelity | — | Parallel, whole-run. **Start from `project/handoff/heroart.md`** — hands and outfits are untouched and are the largest single art gap |

## 4. How to parallelise this

**Unlike phase 2, this one suits the agent-wave method** — the workstreams are
genuinely disjoint by directory. Use it, with the constraints this project has
already paid for:

- **Cap concurrency at ~4.** Six or more headless Chromiums saturate the machine,
  make every measurement worthless and stall agents outright.
- **Disjoint directory ownership, stated explicitly in the brief.** Anything
  outside an agent's list is *reported*, not edited. `src/game/Game.js` and
  `src/game/Shots.js` stay the coordinator's.
- **Tell every agent to commit early and often, even unverified `WIP:` commits.**
  This is the single highest-leverage line in a brief. Three agents were killed
  mid-flight by a laptop sleep this session and lost nothing because of it.
- **If an agent stalls, its transcript may be gone but its branch is not.**
  Re-dispatch a fresh agent whose first command is
  `git merge --no-edit worktree-agent-<id>`, and tell it plainly which inherited
  commits have never been looked at.
- **Verify the merge yourself.** Four inherited diagnoses were wrong this session
  and every one was caught by measuring rather than by trusting the handoff.

## 5. Definition of done

- [ ] **A person can play for 30 minutes** without hitting a dead end or a stub
- [ ] `npm run check` — all gates green, including `combatloop` at 30/30
- [ ] **`perf` and `gameplay` pass 60 fps** — or the failure is explained, owned,
      and accepted deliberately rather than by default
- [ ] The loop closes: fight → reward → spend → fight better
- [ ] A fresh harsh-critic pass, graded against shipped FFXV. **The last score was
      4.5/10 and predates clouds, cartography, collision, menus, combat, the
      rebuilt bestiary, biomes, dressing and everything in this session.** Nobody
      currently knows what this game scores

## 6. What would be wasted effort

The audit's §7 list still stands. Adding to it from what this session learned:

- **Do not add content on top of an unmeasured frame budget.** Two perf gates fail
  now, on a quiet tree, with nobody owning them. Every workstream below adds draw
  calls and systems to that budget.
- **Do not trust a handoff's claim that something was verified.** Four were wrong
  this session, including one that said a species was "deep rebuilt, verified by
  eye" while it rendered flat black.
- **Do not grade against last round.** Grade against shipped FFXV, every time.
