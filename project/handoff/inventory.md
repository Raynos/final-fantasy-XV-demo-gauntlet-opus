# Handoff — inventory (docs/SCOPE.md, docs/WORLDMAP.md)

**Lane:** documentation truth. Read-only in `src/`; owns `docs/SCOPE.md`,
`docs/WORLDMAP.md` and anything new under `docs/`.

**Branch:** `worktree-agent-aa1d53823ec82c26f`, merged from `main` @ `593b373`
(421 commits). The worktree started 88 commits behind; the merge was the first act.

## State

In progress. `docs/WORLDMAP.md` verified against `src/world/map/**` (below);
`docs/SCOPE.md` re-verification underway section by section.

## Verified so far — WORLDMAP.md

Everything below was measured, not read.

| claim | verdict |
|---|---|
| 8192 × 8192 m, sea level −6.5 m, north = −Z | TRUE — `WorldMap.ts:23-33` |
| 2048² near grid at 4 m; 1024² frontier at 32 m out to ±16 km | TRUE — `Field.ts:42-47` |
| 19 zones, 3 regions; every centre/extent/level band in the table | TRUE — `WorldMap.ts:158-279`, row by row |
| 124 POIs, and the full type breakdown (23 parking, 23 landmark, 17 haven, 11 dungeon, 10 tomb, 10 fishing, 8 outpost, 8 menace, 6 imperial, 3 town, 3 reststop, 2 chocobo) | TRUE — counted in `WorldMap.ts:372-740` |
| 48 authored landforms | TRUE — `WorldMap.ts:741-801` |
| 19 routes, 50 junctions, 50 edges, 30.26 km (8.89 / 11.90 / 9.47) | TRUE — `roadcheck.mts`, run 2026-08-23 |
| 18 dead ends, 18 turning circles | TRUE — `roadcheck.mts` step 4 |
| road class table (half-width, shoulder, grade, radius, cruise) | TRUE — `RoadGraph.ts:46-64` |
| every drivable POI reachable | TRUE — 39 drivable, 0 unreachable |

### What was wrong

- **`Crown City Checkpoint (3856, 546)` is stale.** The POI is at **(3478, 498)**
  (`WorldMap.ts:414`). Only the spine paragraph carried the old pair.
- **The `Hammerhead → Keycatrich Ruins` row is stale** in the traversal table:
  chocobo/sprint/walk read 2m03s / 4m24s / 10m15s, and `worldMap.travel()` now
  returns **2m21s / 5m02s / 11m45s**. Drive (1m05s over 1.69 km) still matches.
  Every other row in that table reproduces to the second.
- **`Ecology.worldRadius` is no longer 620 m.** §7 open item 1 says vegetation is
  capped at 620 m from the origin; `Ecology.ts:126` now computes
  `Math.min(4200, tsize * 0.5 - 40)`. That item is closed.
- **The traversal table's `road km` column only governs the `drive` column.**
  `WorldMap.travel()` (`WorldMap.ts:1080-1091`) uses road distance for `drive`
  and *straight line × 1.15 (chocobo) / × 1.25 (walk, sprint)* for the rest, so
  the three right-hand columns are not road times. The numbers are right; the
  heading implies something the code does not do.

## Findings for other lanes (I did not touch `src/`)

- **`src/public/baked/` holds two artifacts, not three.** `terrain.bin.gz` +
  `tex.bin.gz` are present; **`texc.bin.gz` (the painted-face canvas bake) is
  absent.** It is produced only by `node src/tools/texbake.mts --canvas`, which
  needs a browser, so neither the vite plugin nor a plain `texbake --force`
  makes it (`vite-plugin-bake.mts:28-37` says so explicitly and only *prunes* a
  stale one). Any cold-boot number below ~9 s is therefore not reproducible on
  this checkout until someone runs `--canvas`. Not a defect — a cache state.

## Next

- Finish the section-by-section SCOPE re-verification and rewrite the file.
- Fold the WORLDMAP corrections above into `docs/WORLDMAP.md`.
