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

## Order — one agent per plan

**Everything upstream of `after-phase3` is archived.** The four-phase sequence
— rescue, TypeScript, boot and memory, content and gameplay — is closed, and so
are the three parallel plans that ran beside it.

```
  2026-08-21-opus-harness-daemon              DONE 08-23 -> archive/plans/
  2026-08-21-fable-sibling-ports              DONE 08-25 -> archive/plans/
  2026-08-21-fable-procedural-modeling        DONE       -> archive/plans/
  2026-08-22-opus-phase3-boot-and-memory      DONE 08-25 -> archive/plans/
  2026-08-21-opus-rescue-and-sequencing       SUPERSEDED 08-26 — never staffed;
                                              it was the four-phase ORDER, and
                                              phase 4 was the last one open, so
                                              it folded into phase4 §0
  2026-08-22-opus-phase4-content-and-gameplay DONE 08-27 -> archive/plans/
                                              5 of 5, and it took WS-0b's
                                              per-shot floor with it: perf and
                                              gameplay both certify
                    |
                    v
  2026-08-25-opus-after-phase3                four independent workstreams,
    WS-1 head · WS-2 programs · WS-3          one agent each, no collisions.
    geometry bake · WS-4 canopy patch         WS-1 is the top item in the game:
                                              worth 3.0 -> 4.0 on its own costing

  2026-08-26-opus-the-standing-backlog        WS-1..10, extracted from the 52
    head/hair · ground+light · alpha edges ·   handoffs that outlived their
    clouds · Meteor · perf · content ·         agents. Carries a table of ten
    water · harness debt · creatures           MEASURED NEGATIVES — read it
                                               before re-opening anything

  2026-08-24-opus-benchmaxx-harness           IN-PROGRESS, opus (benchmaxx)
    ledger · wait primitive · gate cache ·      A-F implemented 2026-08-27; its
    two pools · turbo · prewarm · policy        definition of done is WEEKLY, so
                                                it closes on a week of ledger,
                                                not on a diff
```

Phase 4's own leftovers are named at the end of its §5, each with an owner in
one of the two live plans above — including the one shot in 142 still over the
draw-call budget, and round 16's ranked list of what a blind judge still
identifies us by.

The three parallel plans collided on two directories. They were assigned to
**one** of them each:
`src/characters/**` (all three want it) and `src/world/veg/` (sibling-ports
§3.6, procedural-modeling §7) both go to **procedural-modeling**.

One dependency no merge will catch: sibling-ports §3.3/§3.4 rewrite the grade,
and procedural-modeling's ground tint has to match it. Grade first.

## What does not belong here

- **A live tracker** — a mutable, checkbox-y "what is in flight" list. That is
  post-decision operational state and belongs in `project/STATUS.md`. Different
  lifecycle: a plan is written once and then either built or abandoned, while a
  tracker is rewritten continuously. Keep them apart.
- **A durable description of the game.** That is `docs/SCOPE.md` and
  `docs/WORLDMAP.md`.
- **A record of what happened.** That is `project/journal/` and the git log.

## Sibling directories

`../SCOPE.md` (the atomic inventory) · `../WORLDMAP.md` (cartography) ·
`../../project/STATUS.md` (live state) · `../../project/archive/` (where plans go
when they are done).
