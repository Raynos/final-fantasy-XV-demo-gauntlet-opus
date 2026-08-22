# Status — 2026-08-22 (overnight build session)

> **This is a snapshot, and it is REPLACED in place, never appended to.** No
> dated "update —" bullets: that is the `journal/` genre. The lossless history is
> `journal/` and the git log, so deleting a line that has stopped being true
> loses nothing. It is capped at 150 lines by `.githooks/pre-commit` for exactly
> this reason — `PROGRESS.md` was allowed to accrete instead and drifted five
> months out of date while still reading as current.

**`main` @ 341 commits · 337 source files · ~108,200 lines · 139 shots · 25
registered systems.** Zero `any`, ratcheted. Last full `npm run check` on a
quiet tree: **10/10 green**.

## The session goal

Finish every open plan in `docs/plans/`, then take the game's models, assets,
world, maps and zones to AAA. Ordered by impact, agreed at the top of the
session:

1. sibling-ports **Wave 1** — the instruments, because they make everything
   after them falsifiable
2. **Phase 3** — boot and memory
3. **Phase 4** — content and gameplay
4. the two unowned perf failures
5. **procedural-modeling** — the art ceiling
6. **harness-daemon** — infra; pays back across sessions, not tonight
7. **process-lifts-from-kami** — three of five items already shipped

## Live right now — four agents, disjoint directories, one worktree each

| who | lane | owns | port |
|---|---|---|---|
| boot-memory | Phase 3: 13.55 s cold boot, nothing cached between loads | `engine/Warmup.ts`, `engine/LightBudget.ts`, `world/props/`, `world/town/`, `world/dungeons/`, `tools/bootprof.mts` | 5320 |
| instruments | sibling-ports Wave 1 §2.3–§2.6 | `tools/perf.mts`, `tools/gameplay.mts`, `tools/shoot.mts`, `tools/imgdiff.mts`, `world/Terrain.ts`, `postfx/ContactShadowPass.ts` | 5330 |
| content-wire | Phase 4: re-audit, then WS-1 "the wire" | `game/rpg/`, `ui/`, `combat/`, enemy *behaviour* | 5340 |
| heroart | hands, outfits, hair — the AAA push | `characters/` rig, meshes, materials, enemy *meshes* | 5350 |

Each keeps its own `project/handoff/<lane>.md`. **`src/game/Game.ts` and
`src/game/Shots.ts` are the coordinator's** — agents report changes there rather
than making them. **Do not take a perf number while these are live.**

## Determinism — CLOSED tonight, at the noise floor

The top open defect in `RESCUE-2026-08-21.md` §B1. Measured on
`prompto_closeup`, 1600×900 PNG:

| | mean/255 | px over 8/255 |
|---|---|---|
| floor — two cold captures, alone | 0.302 | 0.020% |
| alone vs sixth in a batch, **before** | 1.836 | 4.00% |
| alone vs sixth in a batch, **after** | **0.340** | **0.022%** |

**Both handoff hypotheses about the cause were wrong.** `STATUS.md` said
"likely vegetation tile streaming"; pinning that moved the number by 0.009.
The carrier was the **wind**: `Weather.resetClock` only set `_snap`, which skips
the lerp toward the target preset, while the gust envelope `_gust` is integrated
forever and drives `windStrength` through three sines, and `windDir` drifts
permanently — neither is part of `target`, so no preset change and no clock
reset touched them. Probed directly: `windStrength` 0.840 on a page's first
shot, 0.944 after one other shot. Grass, scrub, twigs and hair all sway off that
value, which is why the diff sat on thin silhouettes and read as noise.

Vegetation streaming *was* a real second cause and is also fixed: grass, scrub
and trees each generated tiles against a **wall-clock** `performance.now() +
budgetMs` deadline, so residency depended on machine speed and on what the
previous camera had cached. They now take `converge(camPos)`, called from
`Game.settle` after the first frame — after, because at `applyShot` time the
camera is still where the previous shot left it.

Consequence, and it is the reason this was worth doing first: **`imgdiff` at
1.5/255 means something for the first time, and A/B diffs are falsifiable.**
Every shot moved ~1.06 mean against its old PNG because the wind now sits at
gust phase zero. That is expected; re-baseline the corpus, do not chase it.

Commit `417ca86` has the full account and the method.

## Where the truth is

- `BRIEF.md` — the contract. Art direction, engine contracts, definition of done.
- `project/HANDOFF.md` — the method, the tooling, the architecture.
- `project/LANDMINES.md` — what will bite you, and the seven diagnoses that were
  confidently wrong. Read the last section twice. **Add tonight's two to it:
  "vegetation streaming" and every earlier guess at the determinism cause.**
- `docs/SCOPE.md` — the atomic inventory. **Stale: last verified against `main`
  @ 98 commits (2026-08-17), 243 commits ago.** Re-verifying it is open work.
- `project/README.md` — which document is which genre.

## Gates — 10/10 on a quiet tree, 2026-08-22

`vite build` + both typechecks (enforced per-commit) · `anycheck` 0/0 ·
`orphans` 280/280 · `integration` 18 pass · `uxcheck` 89/89 ·
`creaturecheck` 207 poses · `combatloop` **30/30** · `roadcheck` 0 fail,
30.26 km · `heightcheck` 0.000 m GPU vs CPU · `driftcheck` worst −1.177 m
(reported, not failed).

**Run `npm run check` at every merge, not just the cheap gates.** `combatloop`
slid 30/30 → 21/30 unnoticed for weeks because the expensive ones were skipped.

## The two failures nobody owns yet

| gate | result |
|---|---|
| `perf.mts` | mean ~70 fps, **worst 37.9 fps on `vista_dawn` — FAIL** |
| `gameplay.mts` | **worst segment `walk` at 49.8 fps — FAIL** |

Known contributors: 180–600 ms streaming and weather-rebuild hitches, `storm` at
~21 ms. The gate is every segment ≥60 fps median with no frame over 33 ms.
**The instruments lane is building the self-validating ruler first** — MGS5's
version voids a run under machine contention rather than printing a number that
looks fine. Do not re-baseline until it lands and the tree is quiet.

## Quality — the scores are stale and you are flying on them

Last harsh-critic pass: **4.5/10 overall** — environment 7.5, world dressing 5,
UI 8, combat VFX 6.5, characters 5.5. That pass **predates essentially
everything now in the game**. A fresh pass graded against *shipped FFXV* is the
next thing worth doing after the current lanes merge.

Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata and silhouette, the world map, the opening cutscene, warp-strike VFX.

Known weak and now owned: hands are mittens, outfits flat black, hair reads as
quills (heroart). Still unowned: `Bushes.ts` (491 lines) has never been audited,
`MapScreen` is a 22-line stub, `zone_weaverwilds` has no shot to capture it with,
and `anak` needs a sculpt rather than paint.

## Still missing entirely

Chocobos, fishing, photo-mode capture, camping at havens (only the Hammerhead
caravan works), fast travel, the remaining towns.
