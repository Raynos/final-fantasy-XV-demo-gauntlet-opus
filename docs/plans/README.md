# plans/

**Pre-canon proposals and implementation plans — live ones only.** "Should we do
this, and how?" A plan graduates to `project/archive/` the moment its `Status:`
becomes `DONE` or `SUPERSEDED`, so that an `ls` of this directory answers "what
work is actually open?" without opening anything.

## Naming

`<YYYY-MM-DD>-<model>-<topic>.md` — the date it was written and the model that
wrote it (`opus`, `fable`). The directory sorts chronologically, a stale plan is
obvious at a glance, and plans from parallel gauntlet runs stay attributable.

## Status

Every plan's first non-heading line is:

```
Status: <TOKEN> (<date>, <model>)
```

with `TOKEN` from exactly six:

| token | means |
|---|---|
| `PROPOSED` | written, not signed off. Nothing may depend on it. |
| `LOCKED` | the decision is made; the work has not started. |
| `IN-PROGRESS` | someone is building it now. Name them in `project/STATUS.md`. |
| `DONE` | built and verified. **Graduate to `project/archive/`.** |
| `PARKED` | deliberately not being done, with the reason. Stays here. |
| `SUPERSEDED` | another plan replaced it. **Graduate, naming the replacement.** |

A plan may lock some decisions and leave others open — say so on the line
(`Status: PROPOSED (2026-08-21, opus) — Decision 1 is LOCKED`). The pre-commit
hook warns on a new plan with no `Status:` line; it does not block.

### `IN-PROGRESS` is not `DONE`, and "every plan has a Status" is not "every plan is built"

Audited 2026-08-23, and this is why the section exists: **none of the six open
plans is done, none has graduated, and 6 of 37 definition-of-done boxes across
all six were ticked** — the rest were left blank whether the item was met or
not. `project/STATUS.md` had recorded the session goal as "finish every plan in
`docs/plans/` (**done** — each carries its own `Status:`)", which meant *every
plan now has a Status line* and read as *every plan is built*.

Three rules came out of it, and they are cheap:

1. **Tick the box, or write why not, in the same commit as the work.** An
   unticked box on met work is as much a lie as a ticked box on unmet work; a
   reader cannot tell which kind they are looking at, so the whole checklist
   stops carrying information.
2. **A number in a plan is stamped, not standing.** Gate counts, boot times and
   fps figures go stale within days here. When one changes, either update it or
   mark the old one historical in place. Four documents carried four different
   answers for the same gate suite before this pass.
3. **State the plan's state in the `Status:` line, not in the reader's head.**
   "IN-PROGRESS" with no breakdown is what let a half-built plan and an
   untouched one look identical from `ls`.

## Where the six open plans actually stand

Audited against the tree and the git log, 2026-08-23.

| plan | status | DoD | one line |
|---|---|---|---|
| `2026-08-21-opus-harness-daemon` | PROPOSED | 0/15 | Nothing built, and the defect got worse: **30 of 48** tools launch their own browser, up from 20 of 34 |
| `2026-08-21-fable-sibling-ports` | IN-PROGRESS | 4/6 | Wave 1 done (one item rejected with a measured negative), Wave 2 half, Waves 3–4 untouched |
| `2026-08-21-fable-procedural-modeling` | IN-PROGRESS | 2/6 | Buildings and rocks landed; the silhouette bench the plan asks for was never built |
| `2026-08-21-opus-rescue-and-sequencing` | IN-PROGRESS | — | A sequence, not a build. Phases 1–2 closed, 3–4 open |
| `2026-08-22-opus-phase3-boot-and-memory` | IN-PROGRESS | 3/5 | 13.66 s → 6.88 s cold. Misses its own <6 s target and says so |
| `2026-08-22-opus-phase4-content-and-gameplay` | IN-PROGRESS | 0/5 | Real code landed; **nobody has ever played this game for 30 minutes** |

---

## Execution graph — one agent per plan

Six plans, so at most six agents. **One of them needs no agent at all**
(`rescue-and-sequencing` is a sequence document, not a build), so the real
question is how to schedule five.

Two independent constraints decide it, and conflating them is how the last round
lost its measurements:

- **File overlap** decides whether two plans can be *edited* at the same time.
- **The machine** decides whether they can be *measured* at the same time. There
  is one GPU. Two agents can own perfectly disjoint directories and still make
  each other's numbers worthless.

### What each plan's remaining work touches

| plan | remaining work lands in |
|---|---|
| `2026-08-21-opus-harness-daemon` | `src/tools/**`, `CLAUDE.md`, `.githooks/`, `.claude/hooks/` — **no game code at all** |
| `2026-08-21-fable-sibling-ports` | `src/engine/postfx/**`, `src/world/water/`, **`src/world/veg/`**, **`src/characters/**`**, `src/tools/imgdiff.mts`, `src/game/CameraRig.ts` |
| `2026-08-21-fable-procedural-modeling` | `src/world/props/**`, `src/world/town/**`, **`src/world/veg/`**, **`src/characters/**`**, `src/tools/` (the silhouette bench) |
| `2026-08-22-opus-phase4-content-and-gameplay` | `src/game/rpg/**`, `src/combat/**`, `src/ui/**`, `src/world/vehicle/`, **`src/characters/**`** |
| `2026-08-22-opus-phase3-boot-and-memory` | `src/engine/PostFX.ts` and **every material in the repo** — its one open item is *fewer shader programs* |
| `2026-08-21-opus-rescue-and-sequencing` | nothing. Do not staff it |

The bold entries are the collisions. **Three plans point at `src/characters/**`
and two at `src/world/veg/`.**

### The schedule

```
ROUND 1   ┌────────────────────────────────────────────┐
serial,   │  2026-08-21-opus-harness-daemon            │
alone     │  src/tools/** — rewrites the instruments   │
          └─────────────────────┬──────────────────────┘
                                │
ROUND 2   ┌─────────────────────┼─────────────────────┐
parallel, │                     │                     │
3 agents  ▼                     ▼                     ▼
   ┌──────────────┐  ┌────────────────────┐  ┌──────────────┐
   │ fable-       │  │ fable-procedural-  │  │ opus-phase4- │
   │ sibling-     │  │ modeling           │  │ content-and- │
   │ ports        │  │                    │  │ gameplay     │
   ├──────────────┤  ├────────────────────┤  ├──────────────┤
   │ postfx/      │  │ props/  town/      │  │ rpg/  ui/    │
   │ water/       │  │ veg/  ← ASSIGNED   │  │ combat/      │
   │ imgdiff      │  │ tools/ (bench)     │  │ vehicle/     │
   │              │  │ characters/ ←ASSGN │  │              │
   └──────┬───────┘  └──────────┬─────────┘  └──────┬───────┘
          │                     │                   │
          └─────────────────────┼───────────────────┘
                                │
ROUND 3   ┌─────────────────────▼──────────────────────┐
serial,   │  2026-08-22-opus-phase3-boot-and-memory    │
alone     │  "fewer shader programs" reaches into      │
          │  every material round 2 just rewrote       │
          └─────────────────────┬──────────────────────┘
                                │
ROUND 4   ┌─────────────────────▼──────────────────────┐
serial,   │  phase4's WS-0b: the perf re-baseline      │
alone     │  reads, edits nothing, needs a dead-quiet  │
          │  machine. Same agent, second dispatch.     │
          └────────────────────────────────────────────┘

              2026-08-21-opus-rescue-and-sequencing
              never staffed — it is the sequence, not the work
```

### Round 1 alone — `harness-daemon`

Not because of file conflicts; it has none with game code. Because it **rewrites
the instruments every other plan reports with.** Land a new daemon under three
running agents and three agents' numbers change for reasons none of them can
see. It also settles the worktree-versus-trunk decision, which changes how
rounds 2–4 are dispatched at all.

### Round 2 parallel — three agents, two contested directories

The three plans are *mostly* disjoint, and the overlap is concentrated in two
directories. Assign each one to **exactly one plan's agent** in the brief, and
say plainly that the other two report rather than edit:

- **`src/characters/**` → `fable-procedural-modeling`.** Its §8 is the only one
  of the three that treats characters as a body of work rather than a side
  errand, and the outstanding character debt (head in profile, hair, the 13
  primitive-stack species) is its material. `sibling-ports` Wave 4 (`setMotion`,
  the animation-rate contract) and `phase4` WS-7 must hand their character items
  to that agent or wait for round 3.
- **`src/world/veg/` → `fable-procedural-modeling`.** Grass tier-D
  (`sibling-ports` §3.6) and the tree debt (`procedural-modeling` §7) are the
  same directory, and `GrassField.ts`/`Trees.ts` is too fine a seam to trust
  across two agents. If you would rather split it, split at that file boundary
  and write it into both briefs.
- **`src/game/Game.ts` and `src/game/Shots.ts` stay the coordinator's.** No
  round-2 agent edits either.

One ordering dependency inside round 2 has **no file conflict at all**, so no
merge will catch it: `sibling-ports` §3.3/§3.4 rewrite the grade and aerial
perspective, and `procedural-modeling`'s ground work has to match whatever the
grade ends up being. §3.6 already records this trap — a tint matched to a grade
that is being replaced only has to be matched again. If the render work is
live, hold the ground-tint work behind it.

### Round 3 alone — `phase3`'s last item

Its one open item is not a boot change. "Fewer shader programs" (112 linked at
~14 ms, 228 held) is a change to **how every material in the repo is authored** —
so run it before round 2 and round 2 invalidates it; run it beside round 2 and
nobody can attribute the program count to anything.

### Round 4 alone — the perf baseline

This is not a preference. The ruler measures paired frame differences against a
noise floor and stamps `RULER_VALID: false` when the machine is busy. It
**correctly refused every run for an entire session** because something was
always capturing, and two perf gates are formally uncertified right now for
exactly that reason. Give it the machine.

### The rule the graph does not show

**Disjoint directories do not buy disjoint measurements.** The last round ran
roughly a dozen agents in worktrees on disjoint directories, and what cost the
session was not the one merge conflict — it was that `perf.mts` could not be
certified once, all night. Whatever the graph says about *editing*, capture and
measurement need a quiet tree, and the agent that needs one should say so and
get it.

## What does not belong here

- **A live tracker** — a mutable, checkbox-y "what is in flight" list. That is
  post-decision operational state and belongs in `project/STATUS.md`. Different
  lifecycle: a plan is written once and then either built or abandoned, while a
  tracker is rewritten continuously. Keep them apart. (The per-plan status
  breakdowns above are the exception that proves it: they are an *audit*, dated
  and stamped, not a thing anyone updates as work proceeds.)
- **A durable description of the game.** That is `docs/SCOPE.md` and
  `docs/WORLDMAP.md`.
- **A record of what happened.** That is `project/journal/` and the git log.

## Sibling directories

`../SCOPE.md` (the atomic inventory) · `../WORLDMAP.md` (cartography) ·
`../reference/` (the measured FFXV plates and their numbers) ·
`../../project/STATUS.md` (live state) · `../../project/archive/` (where plans go
when they are done).
