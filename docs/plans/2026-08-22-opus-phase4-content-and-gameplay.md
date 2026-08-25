# Phase 4 — content and gameplay

The largest remaining body of work, and the one that changes what this demo *is*.

**This is the execution plan. The argument and the audit live in
`project/archive/plans/2026-08-17-opus-content-gameplay.md`** (985 lines, archived
— this file superseded it) — its workstream
definitions, its FFXV reference appendices and its case for what to cut are all
still correct and are not repeated here. Read it first. This document says what
has changed since it was written, what order to actually run the work in, and how
to parallelise it.

Status: IN-PROGRESS (2026-08-23, opus) — phase 4 of
`2026-08-21-opus-rescue-and-sequencing.md`. Step 0 (re-audit against the gates)
is **done, and it overturned the audit's central claim**: `src/game/rpg/**` is
not orphaned, and WS-2, WS-3 and WS-6 all have real implementations. What was
genuinely broken was smaller and worse — nothing in the game was pressable, and
no quest waypoint pointed at a real place. Both fixed.

**Audited against the tree 2026-08-23. Real code landed; the definition of done
is unevidenced; 0 of 5 boxes tick.**

| workstream | state |
|---|---|
| 0 re-audit | **DONE**, and it overturned the audit's central claim |
| WS-0b rendering perf | **STILL UNOWNED, but no longer unmeasurable.** A certified full-corpus baseline exists as of 2026-08-25 — `RULER_VALID: true`, floor 16%, mean 218.1 fps, worst 140 (`poi_reststop`), every shot over 60. `bestiary_necromancer` read 51 fps on 2026-08-23 and reads **172**: that failure was the machine. **Three things arrive here from `2026-08-21-fable-sibling-ports` (DONE) — see WS-0b's own row below** |
| WS-1 the wire | **DONE** — `Interaction` has the E verb back, quest coordinates derive from `WorldMap` instead of being typed |
| WS-2 encounters / party AI / death | partial — `CombatBridge`, `PartyState`, `BossFight.resolveStrike` now executes for the first time. The "photo booth" finding is **not** closed |
| WS-3 Hammerhead / NPCs / verb | **DONE** — five named NPCs, camp prompts at every haven |
| WS-4 quests and hunts | **DONE** — 21 dead objectives to zero, six uncompletable hunts fixed, main chain reaches end of chapter 5 |
| WS-5 camp / cook / rest / day cycle | **DONE** — `HavenCamp`, four recipes, and a gate that actually presses the key and rests |
| WS-6 the Regalia | partial — `AutoDrive` exists; nothing verified this round |
| WS-7 character fidelity | partial and **unjudged** — hair and eyes shipped in four commits with +8 draws and +0.42 M triangles, never measured and never scored |
| **beyond the plan** | **fishing** — ten `type: 'fishing'` POIs had been authored into the map and did nothing. `src/game/fishing/` is a real non-combat verb, and the lane before it was right to refuse to tick a `fish` objective off a keypress |

**The gate numbers in the body of this file are stale.** Live, 2026-08-23:
`uxcheck` **93/93**, not 86/86 or 89/89. See `project/STATUS.md` for the
current table and treat every count written below as historical.

See `project/handoff/content-wire.md`.

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
| Perf unknown | **DO NOT USE THE NUMBERS THIS ROW ORIGINALLY CARRIED.** It said `perf` worst 37.9 fps (`vista_dawn`) and `gameplay` worst 49.8 fps (`walk`), and **both came from a ruler that was measuring itself** — it rendered twenty frames in one synchronous task and throttled itself fivefold, scoring correlation **0.107** against the truth *with the ranking inverted*. `vista_dawn`, called the second-worst shot in the game, is **208 fps**. On the fixed ruler the last certified run was mean **243.7 fps** / worst segment **92.2 fps**, `RULER_VALID: true` — but that predates this round's renderer work and has not been re-certified since. See `project/LANDMINES.md`, last section. |
| `combatloop` failing | **30/30 when this was written; 31/31 now.** It was a stale test, not a broken game — the mechanics it covers were working all along |
| Character art "below AAA at closeup" | Improved and still short, but **not in the ways this row listed** — outfits are no longer flat black (leather lost its mirror hit, sleeves crease) and hair is out of the shell reading as strands rather than quills. What is actually open: hands, and the fact that **hair and eyes shipped unjudged**. Current state is `project/handoff/heroart.md`, not this row |

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
| **0** | **Re-audit against the gates** | — | **DONE.** (The "`integration` 18/18" here was the count at the time; it is 27 now. Numbers in this table are historical.) |
| **WS-0b** | **Rendering performance** | — | Runs parallel, whole-run. **Assign an owner** — it has never had one. The baseline is now published and passing (see above), so this is no longer about certifying the tree; it is about the three items below |
| **WS-1** | **The wire**: RPG ↔ UI ↔ combat ↔ world | 0 | Still the first content workstream. Scope it from the re-audit, not from the original list |
| **WS-2** | Encounters, party combat AI, death | WS-1 | The "photo booth" fix |
| **WS-3** | Hammerhead, NPCs, the interaction verb | WS-1 | The first place a player stands still and *does* something |
| **WS-4** | Quests and hunts | WS-1, WS-3 | |
| **WS-5** | Camp, cook, rest, day cycle | WS-1, WS-3 | |
| **WS-6** | The Regalia | WS-1, WS-3 | Note `SHOT_STAGES` and the two-Regalia trap in `project/archive/handoff/cineui.md` §6.3 |
| **WS-7** | Character fidelity | — | Parallel, whole-run. **Start from `project/handoff/heroart.md`** — hands and outfits are untouched and are the largest single art gap |

### WS-0b's inbox, from the sibling-ports plan

`docs/plans/2026-08-21-fable-sibling-ports.md` closed DONE on 2026-08-25 and
handed three items here rather than ticking them.

1. **The frame-cost split** (pixel-scaled vs fixed), Wave 3's last open item.
   MGS5's method and the reason it matters: theirs split 17.8 + 7.4 ms, and *no
   post deletion could reach 16.7*. Ours decides whether the walk-segment fix is
   shadows, post consolidation or render scale — and **post consolidation is
   gated on its answer**, so do not start it first.
   `perf.mts <shots> --w 1600 --h 900` against `--w 800 --h 450` fits
   `t = fixed + pixels·k` from two points.
2. **A noise floor per shot in `perf.mts`, and do (1) after it, not before.**
   The split was attempted twice on 2026-08-25 and voided both times at a
   35-37% floor. The reason is item 3 below, and the shortcut is a trap: the
   floor is measured on `shots[0]`, so leading the run with a quiet shot buys a
   "valid" run, and quoting heavy shots against that floor is precisely the
   self-flattery `perf.mts`'s ruler exists to prevent. §6.2 already measured a
   16x spread in per-shot floors for `imgdiff.mts`; the same lesson has never
   been applied here.
3. **The order of the arguments decides whether a run certifies.** `perf A B`
   and `perf B A` can disagree about the same machine and the same build —
   measured within minutes on one box, 16% led by `hero_closeup` against 35% led
   by `poi_reststop`. In `LANDMINES.md`.

Also arriving, though not WS-0b's: **the daylight grade's shadow-warmth row is
re-filed from the ambient probe to ground albedo.** Two handoffs blamed the
probe. The whole diffuse ambient, ablated outright under pinned exposure, is
worth **2.6 points of a 15-point gap** — `imagestats.mts`'s docstring explains
it: outdoors the darkest quartile is mostly ground, so `sh(R-B)` reads terrain
and vegetation albedo, not fill colour. Whoever next owns terrain albedo owns
this.

## 4. How to parallelise this

**Unlike phase 2, this one suits the agent-wave method** — the workstreams are
genuinely disjoint by directory. Use it, with the constraints this project has
already paid for:

- **Cap concurrency at ~4.** Six or more headless Chromiums saturate the machine,
  make every measurement worthless and stall agents outright.
- **Disjoint directory ownership, stated explicitly in the brief.** Anything
  outside an agent's list is *reported*, not edited. `src/game/Game.ts` and
  `src/game/Shots.ts` stay the coordinator's.
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

Ticked 2026-08-23 against the tree. **0 of 5.** Every one of these is
*closer* than it was and not one of them is closed.

- [ ] **A person can play for 30 minutes** without hitting a dead end or a stub.
      **Never tested.** No document in this repo records anyone playing this game
      for thirty minutes. Every judgement made here is on a still frame or a
      scripted probe. This is the single largest evidence gap in phase 4, and
      the gates cannot close it — a gate proves a path is *reachable*, not that
      half an hour of it is *worth playing*.
- [ ] `pnpm run check` — all gates green. **Green, but the target moved:** the
      suite is **12** gates without `--perf` and 14 with, `combatloop` is 31/31 not
      30/30, and `uxcheck` is 93/93. Left unticked because the two `--perf`
      gates below are part of "all gates" and they are uncertified.
- [ ] **`perf` and `gameplay` pass 60 fps** — or the failure is explained, owned,
      and accepted deliberately rather than by default. **Neither.** The last
      certified run passed comfortably (mean 243.7 fps, worst segment 92.2 fps,
      `RULER_VALID: true`) but predates this round's renderer changes, and the
      ruler has refused every run since because the tree has not been quiet.
      **Still nobody's job.**
- [ ] The loop closes: fight → reward → spend → fight better. Partial —
      `combatloop` proves EXP on kill, Ascension, Elemancy craft and the
      inventory are individually reachable. Nothing proves a player *experiences*
      them as a loop.
- [ ] A fresh harsh-critic pass, graded against shipped FFXV. **Run, ten rounds,
      and this box stays open on purpose.** `compare.mts` with a sealed key and
      a `--control` arm now scores **4.5/10** — that is a *current* number with a
      control, not the stale one this line was written about. It is unticked
      because the score has barely moved (3 -> 4.5) and **we have never fooled
      the judge once.** Its own answer for what gives us away is **authoring** —
      *"the same few instances repeated"* — not a list of rendering defects.

## 6. What would be wasted effort

The audit's §7 list still stands. Adding to it from what this session learned:

- **Do not add content on top of an unmeasured frame budget.** Two perf gates fail
  now, on a quiet tree, with nobody owning them. Every workstream below adds draw
  calls and systems to that budget.
- **Do not trust a handoff's claim that something was verified.** Four were wrong
  this session, including one that said a species was "deep rebuilt, verified by
  eye" while it rendered flat black.
- **Do not grade against last round.** Grade against shipped FFXV, every time.
