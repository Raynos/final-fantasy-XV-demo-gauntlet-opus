# Phase 4 — content and gameplay

The largest remaining body of work, and the one that changes what this demo *is*.

**This is the execution plan. The argument and the audit live in
`project/archive/plans/2026-08-17-opus-content-gameplay.md`** (985 lines, archived
— this file superseded it) — its workstream
definitions, its FFXV reference appendices and its case for what to cut are all
still correct and are not repeated here. Read it first. This document says what
has changed since it was written, what order to actually run the work in, and how
to parallelise it.

Status: IN-PROGRESS (2026-08-26, opus) — **the last open phase of the four-phase
sequence this plan has now absorbed; see §0.** Step 0 (re-audit against the
gates) is **done, and it overturned the audit's central claim**: `src/game/rpg/**` is
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
| WS-7 character fidelity | hands and outfits done and priced (2026-08-27, `626908b..347041c`, **+28.5 k triangles and zero draw calls**); hair and eyes **now judged** — hair helps and its new tell is named, the eyes cannot be graded until the head lands. `project/handoff/ws7-hands-outfits.md` §7 is what is left. The "+8 draws and +0.42 M triangles" the audit quoted was never re-measured and the nine-shot table in that handoff supersedes it |
| **beyond the plan** | **fishing** — ten `type: 'fishing'` POIs had been authored into the map and did nothing. `src/game/fishing/` is a real non-combat verb, and the lane before it was right to refuse to tick a `fish` objective off a keypress |

**The gate numbers in the body of this file are stale.** Live, 2026-08-23:
`uxcheck` **93/93**, not 86/86 or 89/89. See `project/STATUS.md` for the
current table and treat every count written below as historical.

Its lane's handoff graduated to `project/archive/handoff/content-wire.md` with
the other 51 on 2026-08-26, and `project/handoff/` is empty — so **this plan has
no owner.** Its open work is here and in the two plans named at the end of §0,
and nowhere else.

---

## 0. Where this plan came from — the four-phase sequence, closed

**This plan absorbed `2026-08-21-opus-rescue-and-sequencing.md` on 2026-08-26.**
That file is SUPERSEDED and lives at
`project/archive/plans/2026-08-21-opus-rescue-and-sequencing.md`. It was the
agreed *order* of work — never a tracker, and never staffed. Three of its four
phases are closed, so all it had left to say was this plan and a handful of
lessons, and both are now here.

| phase | outcome |
|---|---|
| **1 rescue** | CLOSED. The ledger is `project/archive/RESCUE-2026-08-21.md` — an item-by-item reconstruction of what a force-killed coordinator session left behind, **each claim reconciled against `main` rather than against the handoffs**. Seven items turned out to be already landed; roughly sixty were genuinely abandoned. |
| **2 TypeScript** | DONE and verified — `anycheck` 0 `any`, both `tsc` projects clean, both wired into the pre-commit hook. `project/archive/plans/2026-08-22-opus-phase2-typescript-port.md`. |
| **3 boot and memory** | DONE 2026-08-25, and **amended rather than ticked**: cold boot 13.66 -> **6.64 s** (`?shoot`) / **6.41 s** (`--play`), warm **6.03 / 6.15**, against targets of under 6 s cold and under 3 s warm. Warm was never reachable and two passes left the row open rather than say so. `project/archive/plans/2026-08-22-opus-phase3-boot-and-memory.md`. |
| **4 content and gameplay** | **This file — the only phase still open.** |

The human's sequence, in their words: rescue and finish the abandoned work →
TypeScript → their own `TODO.md` items → content and gameplay. Phase 4 is last
deliberately. The port went before it because **its cost scales with the size of
the codebase and this phase grows the codebase substantially**, in exactly the
layer (`rpg/**`, the combat event map, `Shot`) where type value is highest. That
sizing argument is spent now, but the number it turned on is still cited by other
estimates and is still drifting: 235 modules when the port was written, **291
modules and ~143,000 lines as of 2026-08-23** (`orphans` counts 302 as of
2026-08-25), growing ~5k lines a session. Quote that, not an older figure.

**Two boxes in §5 are no longer staffed from here.** The 30-minute playtest and
the harsh-critic pass are moved by work that now lives in
`docs/plans/2026-08-25-opus-after-phase3.md` — WS-1, the head, whose own costing
says nothing in the environment can buy a grade point while that frame exists —
and in `docs/plans/2026-08-26-opus-the-standing-backlog.md`. They stay listed
below because they are still the bar this phase is judged against; they are not
this plan's to schedule.

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
| **WS-7** | Character fidelity | — | Parallel, whole-run. Hands and outfits landed 2026-08-27 — **start from `project/handoff/ws7-hands-outfits.md`**, not from `project/archive/handoff/heroart.md`, which predates them. Judge every character change against `docs/reference/plates/party-three-field-02.jpg` through `src/tools/_probe/ws7.mts`: it is `party_formation`'s own framing with the shipped outfits in it, and four of the five defects that pass found were things the plate simply has |

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

### Lessons inherited from the rescue

Paid for once already, in §4 of the plan this one absorbed. They are about
*believing* results, where the bullets above are about not losing work.

- **Control before concluding.** The determinism work would have been declared
  finished at 2.068 mean/255 against a *remembered* 1.5–1.9 noise floor.
  Measuring the actual floor for that shot showed **0.305**, so the job was not
  done. It closed properly later at 0.340 against a measured 0.302.
- **Pin every integrated phase, not the ones a handoff happens to name.** That
  determinism residual was **the wind**, and the guess in the handoff — vegetation
  tile streaming — was wrong. `Weather.resetClock` set only `_snap`, while
  `_gust` integrates forever and `windDir` drifts permanently, so no preset
  change and no clock reset ever touched them. Wall-clock streaming budgets were
  a real second cause worth **0.009**; what they bought was machine-independence,
  not the number.
- **Verify a handoff's claims against the source, by reading the file.** Seven
  rescue items were already fixed when the handoffs called them open, and several
  reported as applied were not. Two plans have since produced 24 more false rows,
  always in the same direction — work called open that was already built — and
  almost always findable by opening the file. Grepping for a word the author
  might have used is not reading it. **Nothing type-checks a plan.**

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
