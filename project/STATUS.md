# Status — 2026-08-22

> **This is a snapshot, and it is REPLACED in place, never appended to.** No
> dated "update —" bullets: that is the `journal/` genre. The lossless history is
> `journal/` and the git log, so deleting a line that has stopped being true
> loses nothing. It is capped at 150 lines by `.githooks/pre-commit` for exactly
> this reason — `PROGRESS.md` was allowed to accrete instead and drifted five
> months out of date while still reading as current.

**`main` @ 338 commits · 337 source files · ~108,200 lines · 139 shots · 25
registered systems.** Tree otherwise clean: no `agent/*` branches, no worktrees,
no orphaned vite/chromium.

## Live right now

| who | what | owns |
|---|---|---|
| zero-`any` agent | **5,253 `any` left**, from 7,861 — 33% gone. Ratcheted by `ANY_BUDGET.json`; `node src/tools/anycheck.mts` counts and enforces, `--set` lowers the ceiling. | all of `src/` |

`project/handoff/no-any.md` is that agent's handoff and is the live document for
it. **`src/` is being edited broadly right now** — do not take a perf number, and
do not read a dirty `git status` as your own.

## Where the truth is

- `BRIEF.md` — the contract. Art direction, engine contracts, definition of done.
- `project/HANDOFF.md` — how this is built: the method, the tooling, the
  architecture. Read it before writing code.
- `project/LANDMINES.md` — what will bite you, and the seven diagnoses that were
  confidently wrong. Read the last section twice.
- `docs/SCOPE.md` — the atomic inventory. **Stale: last verified against `main`
  @ 98 commits (2026-08-17), 240 commits ago.** Re-verifying it is open work.
- `project/README.md` — which document is which genre, and the rules that keep
  them from rotting.

## Gates

Last full `npm run check` was **9/9 green on 2026-08-22**, before the zero-`any`
work started. Not re-run since — the tree has been dirty throughout.

| gate | last result |
|---|---|
| `npx vite build` + both typechecks | pass, enforced per-commit by `.githooks/pre-commit` |
| `integration.mts` | 18 pass · 0 fail |
| `uxcheck.mts` | 89/89 |
| `orphans.mts` | 273/273, no dead code |
| `combatloop.mts` | **30/30** (was 21/30; the 21 was a stale test, not a regression) |
| `roadcheck.mts` | 0 failures, 30.26 km |
| `heightcheck.mts` | 0.000 m GPU vs CPU |
| `creaturecheck.mts` | pass |

**Run `npm run check` at every merge, not just the cheap gates.** `combatloop`
slid 30/30 → 21/30 and went unnoticed for weeks because the expensive ones were
skipped. `npm run check:perf` adds `perf.mts` and `gameplay.mts` and is opt-in —
only ever run it on a quiet tree.

## The two failures nobody owns

Measured on a genuinely quiet tree on 2026-08-22 — **the first trustworthy perf
numbers this project has had**, because every earlier one was taken with agents
live.

| gate | result |
|---|---|
| `perf.mts` | mean ~70 fps, **worst 37.9 fps on `vista_dawn` — FAIL** |
| `gameplay.mts` | **worst segment `walk` at 49.8 fps — FAIL** |

Known contributors: 180–600 ms streaming and weather-rebuild hitches, `storm` at
~21 ms. The gate is every segment ≥60 fps median with no frame over 33 ms.

## Determinism — improved 19×, not closed

A `follow` shot alone versus sixth in a batch: **39.200 → 1.511** mean/255,
against a **measured control floor of 0.373 for that shot**. Three causes, only
the first of which was in any handoff — `Party.snap()`; `Director.setScenario`
early-returning when the scenario name was unchanged, so consecutive `field`
shots skipped the reset entirely; and `resetClock()` running once per page rather
than per shot. **Still ~4× this shot's own floor.** Likely vegetation tile
streaming. Do not record it as closed.

## Quality — the scores are stale and you are flying on them

Last harsh-critic pass: **4.5/10 overall** — environment 7.5, world dressing 5,
UI 8, combat VFX 6.5, characters 5.5. That pass **predates essentially everything
now in the game**: clouds, cartography, collision, menus, the combat loop, the
rebuilt bestiary, biomes, dressing, the dev suite and the TypeScript port.

Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata and silhouette, the world map, the opening cutscene, warp-strike VFX.

Known weak, and open: hands are still mittens, outfits still flat black, hair
reads as quills, anak needs a sculpt not paint, `Bushes.ts` (491 lines) has never
been audited by anyone, `MapScreen` is a 22-line stub, and `zone_weaverwilds` has
no shot to capture it with.

## Next, in order

1. **Finish zero-`any`.** In flight; whole-repo lock, cannot run as a parallel
   wave.
2. **A fresh harsh-critic pass**, graded against shipped FFXV. Everything above
   about quality is guesswork until this runs.
3. **Own the two perf failures.** Re-measure on a quiet tree first — the numbers
   above are trustworthy but three weeks old.
4. **Phase 3 — boot and memory** (`docs/plans/2026-08-22-opus-phase3-boot-and-memory.md`).
   Boot is 13.55 s cold / 12.84 s warm, so nothing is cached. Note the human's
   memory premise in `TODO.md` is backwards: `?debug` uses *less* JS heap than
   the plain page.
5. **Phase 4 — content and gameplay** (`docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md`).
   Re-audit first: the 985-line audit was drawn while `combatloop` was
   misreporting.
6. **Re-verify `docs/SCOPE.md`** against current `main`.
7. Still missing entirely: chocobos, fishing, photo-mode capture, camping at
   havens (only the Hammerhead caravan works), fast travel, the remaining towns.
