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

  2026-08-24-opus-benchmaxx-harness           DONE 08-28 -> archive/plans/
  2026-08-27-opus-gate-audit                  SUPERSEDED 08-28 — items 1-2 built
  2026-08-28-opus-the-100x-map                SUPERSEDED 08-28 — it was a RECORD
  2026-08-28-opus-close-out                   DONE 08-28 -> archive/plans/
  2026-08-31-opus-mobile-10x                  DONE 08-31 -> archive/plans/
                    |                           8 of 10 closed the same night;
                    v                           5 of those as NEGATIVE results
  2026-08-26-opus-the-standing-backlog §WS-12   the two that were builds:
    12a content cache · 12b materials           ~1.5 s of a 6.5 s boot, and
                                                288 material buckets
```

The three that graduated on 08-28 were **not** half-built: benchmaxx had shipped
every phase and was held open by a DoD written against a calendar; the gate audit
had built two of its four items and staffed neither of the rest; the 100x map was
a retrospective wearing a `Status:` line. Their residue became close-out's ten
items, and close-out itself graduated the same night.

`mobile-10x` is the newest and the one to read first if the phone build is the
subject: it carries two counter-intuitive measurements that are expensive to
rediscover — **WebP beats gzip 3x on textures and LOSES on terrain**, and
`?q=low` had shadows switched on for the project's whole life because
`Sky.init` overwrote the tier. It closed 4 of 5 steps and **declined the fifth
with a number** rather than leaving it open.

**Read close-out's "What actually happened" before re-opening any harness cost
work.** Five of its ten items closed as measured negatives — deleting
`Vegetation`'s origin prime moves `hero_full` by 13/255; `combatloop` matching
the page-pool key costs +28 s to save 7.5 s; the shader warm-up is worth 0.53 s,
not the 1.71 s its own line claims — and **two of the numbers the plan was
written against were instrument defects**, not real: "median shoot 22.6 s" was
corpus chunks sharing a row-kind with `shoot` (a real shoot is 8.0 s cold, 1 s
warm), and "4.5% job errors" was 0.66% once red gates stopped counting as
faults.

Phase 4's own leftovers are named at the end of its §5, each with an owner in
one of the two live plans above — including round 16's ranked list of what a
blind judge still identifies us by. **Its one shot still over the draw-call
budget is closed**: the full corpus is 0 of 142 over 800, and
`project/draw-baseline.json` has been deleted rather than emptied.

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
