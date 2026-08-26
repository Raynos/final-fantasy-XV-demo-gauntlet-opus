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

```
  2026-08-21-opus-harness-daemon   DONE 2026-08-23 -> project/archive/plans/
                    |
    +---------------+---------------+
    |               |               |
  2026-08-21-     2026-08-21-     2026-08-22-                     parallel
  fable-sibling-  fable-          opus-phase4-
  ports           procedural-     content-and-
  DONE 08-25 ->   modeling        gameplay
  archive/plans/  DONE -> archive
    |               |               |
    +---------------+---------------+
                    |
  2026-08-22-opus-phase3-boot-and-memory      DONE 2026-08-25 -> project/archive/plans/
                    |
  2026-08-25-opus-after-phase3                four independent workstreams,
    WS-1 head · WS-2 programs · WS-3          one agent each, no collisions
    geometry bake · WS-4 canopy patch
                    |
  phase4's WS-0b perf                         the re-baseline is PUBLISHED and
    frame-cost split · per-shot floor          PASSING (2026-08-25). What is
                                               left is the cost split, and the
                                               ruler defect that blocked it

  2026-08-26-opus-the-standing-backlog        WS-1..10, extracted from the 52
    head/hair · ground+light · alpha edges ·   handoffs that outlived their
    clouds · Meteor · perf · content ·         agents. Carries a table of ten
    water · harness debt · creatures           MEASURED NEGATIVES — read it
                                               before re-opening anything

  2026-08-21-opus-rescue-and-sequencing       never staffed — it is the sequence
```

The parallel three collide on two directories. Assign each to **one** of them:
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
