# harness lane — `src/tools/`

**Status: in progress.** WS-9 of `docs/plans/2026-08-26-opus-the-standing-backlog.md`,
eight items. Ownership: `src/tools/` only. `geometry-bake` is also in `src/tools/`
on disjoint files (`bake.mts`).

## Done and verified

### 1. `--hide` was photographing a different shadow-cascade phase — `da7bfe2`, `86893c8`

**This is the one three lanes were blocked on. It is landed and it is green.**

Every `--hide` frame rendered ~320 draws and 4.5 M triangles less than its
control, whatever was hidden. It was not streaming and it was not the name
matching. It was **one frame**.

`Sky._updateCascades` refreshes the three shadow cascades on a stride of
`[1, 2, 4]` at `ultra`, keyed on `game.time.frame`, and `Clouds.renderShadow` on
`frame & 3`. The near cascade is 183 draws, the middle +148, the far +298.
`applyShot` calls `resetClock()`, so the pose always ends on frame **8** — a
multiple of 4, the phase where all three cascades and the cloud shadow are due,
the most expensive frame of the cycle. Held pose at `town_forecourt`:

    frame  8   9   10  11  12  13  14  15  16
    calls  791 612 690 612 791 612 690 612 791

The hide pass hid, then stepped **one more frame**: control on 8, ablation on 9.
The fix spends the last settle frame on the ablation instead of adding one after
it (`settle(7)` + hide + `frame()` against `settle(8)`) — identical step count,
identical frame index, identical phase.

Measured end to end, `--raw`, `town_forecourt`:

| frame | calls | Mtris | delta |
|---|---:|---:|---:|
| control | 1193 | 14.0943 | — |
| `--hide poi_landmark_fossil_wood` | 1188 | 14.0869 | **5 draws** (was −301) |
| `--hide poi_kits` | 1160 | 14.0805 | **33 draws** (was −349) |

And 1188 − 1160 = **28**, which is exactly what `handoff/seating.md`'s
difference-two-ablations workaround recovered. The offset is gone and the
number the workaround was reaching for is now reported directly.

**PROTOCOL 13 → 14.** The change is server-side, so a client that does not
restart the daemon debugs code that is not running.

Probe: `src/tools/_probe/hidephase.mts`. Also fixed: the batched `countsOnly`
path has no ablation arm and silently ignored `hide`/`raw`; those requests now
fall through to the per-shot loop.

**The general shape, which outlives the bug:** a frame is not a scalar function
of the world, it is a function of the world *and the frame index*. Anything on a
stride — cascades, cloud shadows, TAA — makes two frames of an identical world
differ by hundreds of draws. Any A/B that does not run its arms to the same
frame count is measuring the schedule.

### 3a. `assertAttributeContract` has a caller and a gate — `ebdc699`

It was the one assert in `GeoAssert.ts` with no caller anywhere, not even a
control in `geocheck`. `geocheck` now asserts it over the bestiary — the only
population it can build in bare Node that carries meshes *and* materials — with
three new controls (mapped quad with no uv must throw; with uv must not;
`vertexColors` with no colour attribute must throw).

    material/mesh contract  0 broken of 21 mesh/material pairs, 21 of which bind
                            a map, an aoMap, a normalMap or vertexColors

The population is printed with the verdict: a zero over a population of zero is
a check that never ran.

## Closed as already done (measured negative)

### 2. `check.mts` rendering VOID as FAIL — **already fixed before this lane**

`check.mts` already has `const VOID = 3` / `BUSY = 4`, a `verdict()` that prints
`PASS | VOID | BUSY | FAIL`, `failed` excludes VOID and BUSY, and a separate
summary line: *"VOID/BUSY (measured nothing, not a regression)"*. `perf.mts:445`
and `gameplay.mts:409` both `process.exit(3)` on `RULER_VALID: false`. Landed in
`9c71cdb`. The backlog entry is stale — no change made.

## Handed over — other lanes own the files

`GeoAssert.ts`'s four build-time call sites: two are already wired by the lanes
that own the geometry, and the remaining two are in directories this lane does
not own. Each is one line, and **must be wrapped in try/catch + `console.error`,
never a bare throw** — an assert that throws inside `init()` hangs the boot, and
every browser tool on the machine then returns a bare `waitForFunction` timeout
with no message (LANDMINES).

| assert | call site | who owns it | state |
|---|---|---|---|
| `assertUpward` | shore ribbon, river strip | `water-content` | **wired** (`water/Shore.ts`, `water/River.ts`) |
| `assertCardOrientation` | hair / impostor cards | `head` | **wired** (`rig/Hair.ts`, guarded) |
| `assertConsistentWinding` | the river hull, any closed body a generator emits | `water-content` | **not wired** |
| `assertAttributeContract` | any mesh built for a textured material — the megalith case | `landmarks` (`world/props/`) | **not wired in a generator**; gated in `geocheck` over the bestiary |

## Left, in order

4. Family-level ratchet for `silhouette --set rocks`: fail if `distinct/n` falls
   below a floor (fin 19/24, hoodoo 20/24, pinnacle 21/24, boss 24/24,
   stack 24/24, base 8/8). Named pairs cannot be ratcheted — a tor's name is its
   seed index, so any edit to `torPlan`'s draw order renumbers every subject.
5. `window.GAME: any` → `Game` in `src/globals.d.ts`. Verify with
   `node src/tools/anycheck.mts`. The remaining tools-side `any` is
   `browser.d.ts`'s URL wildcard and needs a `tsconfig.tools.json` path mapping.
6. Re-seat the 13 floating landmarks (`floatcheck --worst 20`), re-take the
   float baseline, **restore `poiFloating: 0` by hand**. `src/world/props/` is
   the `landmarks` lane's — measure and hand over rather than edit.
7. Blindness lines on `seatcheck`, `creaturecheck`, `edgestat`, `imagestats`,
   `driftcheck`.
8. `MapScreen` (22 lines, `src/ui/`) — last, and only with `ui-shoot` captures
   read before and after.

Plus: `project/must-run.json` against the generators that exist (in progress —
`reachcheck --json` census).

## Files touched

`src/tools/daemon.mts`, `src/tools/geocheck.mts`, `src/tools/_probe/hidephase.mts`,
`project/LANDMINES.md`.
