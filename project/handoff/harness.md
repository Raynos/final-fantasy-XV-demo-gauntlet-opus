# harness lane — `src/tools/`

WS-9 of `docs/plans/2026-08-26-opus-the-standing-backlog.md`, eight items.
Ownership: `src/tools/` (and `src/ui/` for item 8). `geometry-bake` is also in
`src/tools/` on disjoint files.

**Four of the eight items were already done before this lane started.** The
backlog rows were stale, not wrong when written. Each is closed with the
evidence below rather than re-implemented.

## Landed

### 1. `--hide` was photographing a different shadow-cascade phase — `da7bfe2`, `86893c8`

**The one three lanes were blocked on. Landed and green.**

Every `--hide` frame rendered ~320 draws and 4.5 M triangles less than its
control, whatever was hidden. Not streaming, not the name matching. **One frame.**

`Sky._updateCascades` refreshes the three shadow cascades on a stride of
`[1, 2, 4]` at `ultra`, keyed on `game.time.frame`, and `Clouds.renderShadow` on
`frame & 3`. Near cascade 183 draws, middle +148, far +298. `applyShot` calls
`resetClock()`, so the pose always ends on frame **8** — a multiple of 4, where
all three cascades and the cloud shadow are due: the most expensive frame of the
cycle. One held pose at `town_forecourt`:

    frame  8   9   10  11  12  13  14  15  16
    calls  791 612 690 612 791 612 690 612 791

The hide pass hid, then stepped **one more frame** — control on 8, ablation on 9.
Fixed by spending the last settle frame on the ablation instead of adding one
after it: `settle(7)` + hide + `frame()` against `settle(8)`. Identical step
count, identical frame index, identical phase.

| `--raw`, `town_forecourt` | calls | Mtris | delta |
|---|---:|---:|---:|
| control | 1193 | 14.0943 | — |
| `--hide poi_landmark_fossil_wood` | 1188 | 14.0869 | **5 draws** (was −301) |
| `--hide poi_kits` | 1160 | 14.0805 | **33 draws** (was −349) |

1188 − 1160 = **28**, exactly what the difference-two-ablations workaround
recovered. **PROTOCOL 13 → 14.** Probe: `src/tools/_probe/hidephase.mts`.
Also: the batched `countsOnly` path has no ablation arm and silently ignored
`hide`/`raw`; those now fall through to the per-shot loop.

### 3. `assertAttributeContract` has a caller and a gate — `ebdc699`

The one assert in `GeoAssert.ts` with no caller anywhere, not even a control.
`geocheck` now asserts it over the bestiary — the only population it can build
in bare Node carrying meshes *and* materials — with three new controls.

    material/mesh contract  0 broken of 21 mesh/material pairs, 21 of which bind
                            a map, an aoMap, a normalMap or vertexColors

The population is printed with the verdict: a zero over a population of zero is
a check that never ran.

### 3b. must-run.json + DEAD vs GONE — `4ecdb3f`

Seventeen generator entry points run in the exercise and nothing asserted it:
`Rocks._genCell/_genTor/_genOutcrop/_stack`, `PoiKits._make`, `Debris._genCell`,
`RoadFurniture._buildChunk`, `Trees._makeTile/_makeCanopyTile/_writeImpostor`,
`Bushes._makeTile/_makeMassTile`, `GrassField._makeTile`, `PartBuilder.build`,
`Water.surfaceAt`, `Dungeons.interact`, `WorldMap.travel`. 56/56 reached.

They are private methods on files other lanes are rewriting, so first:
`reachcheck` now separates **DEAD** (instrumented, never ran — the feature is
unreachable) from **GONE** (never instrumented — a stale roster name, *or* a
class the wrapper walk never reached; `BossFight.resolveStrike`, this tool's own
headline example, reads GONE for the second reason). Both still exit 1.
Plus a blindness line: anything called only during `init()` cannot appear at all.

### 7. Blindness lines — `41eed1d`, and `f176f07`

`creaturecheck`, `driftcheck`, `imagestats` now declare their blind spots in
their own output. `seatcheck` and `edgestat` already had them. Separately
`anycheck` printed `0 across 0 files`, which is what a scanner that walked
nothing says; it now prints `0 in 0 of 534 files scanned`.

### 8. `ui-shoot`: the six menu screens nothing had ever photographed — `884e8c8`

`Menus` registers fifteen screens; nine had shots and six of those had
`ui-shoot` scenes. `elemancy`, `armiger`, `quests`, `archives`, `system`,
`controls` — ~2,000 lines of layout — had never appeared in a capture.

## In flight — the menu scrim's blur has never rendered

**Uncommitted, waiting on a co-agent's `src/world/terrain/TerrainMaterial.ts`
syntax error to clear the pre-commit typecheck.** Files: `src/ui/ui.css`,
`src/ui/Menus.ts`, `src/tools/ui-shoot.mts`, `src/tools/_probe/scrimfix2.mts`,
`src/tools/_probe/scrimtone.mts`.

Looking at the six screens is what found it: five read as pale type floating on
sharp terrain with the party walking through the reading column, and `controls`
— the one that draws real dark cards — read fine. The cause is not the screens.

`Menus.lateUpdate` has always written `backdrop-filter: blur(26px)
saturate(.58) brightness(.54)` on `.menu-scrim`; it computes to exactly that;
and it has never rendered. `backdrop-filter` samples the backdrop of the
element's own compositing layer, and inside `#menus` (`position:absolute;
z-index:2`) that backdrop is empty while the canvas is a different layer.

Six arms, one held pose, blur only, PNG bytes as the proxy
(`_probe/scrimfix2.mts`): as shipped 3.08 MB · scrim `position:fixed` 3.08 ·
`will-change` 3.08 · `translateZ(0)` 3.08 · `#menus` fixed 3.08 · **scrim
re-homed into `uiRoot` 0.51**. Only re-homing works. So the scrim is now a
sibling of `#menus` inside `uiRoot`, and `lateUpdate` hides it explicitly since
it no longer inherits `#menus`'s `display:none`.

And the gradient is lighter — `.74/.93` → **`.52/.72`** — because it used to be
doing all the dimming alone; over a live `brightness(.54)` it was a black
rectangle with type on it (`_probe/scrimtone.mts`, five arms).

**Next step:** re-run `node src/tools/ui-shoot.mts <the six> menu_main hud_field
--out tmp/shots/menus4 --dirty`, look at all eight, confirm `hud_field` is
untouched (menu closed ⇒ scrim `display:none`), then commit. **Then measure the
cost**: a full-screen 26px backdrop blur that never ran now runs every menu
frame. `gameplay.mts` drives menus and BRIEF's rule is no frame over 33 ms —
that gate is the one that has to sign this off.

## Closed as already done (measured negatives)

- **2. `check.mts` VOID column.** Already there: `VOID = 3`, `BUSY = 4`,
  `verdict()` prints `PASS|VOID|BUSY|FAIL`, `failed` excludes both, separate
  summary line. `perf.mts:445` and `gameplay.mts:409` exit 3 on
  `RULER_VALID: false`. Landed in `9c71cdb`.
- **4. Family-level rocks ratchet.** Already there and wired: `silrocks` in
  `check.mts` at `--seeds 24 --reseeds 5`, floors per family in
  `project/silhouette-baseline.json` (base 8/8, stack 23/24, boss 24/24, fin
  13/24, hoodoo 19/24, pinnacle 14/24 — lower than the plan's numbers because
  they are minima over five resamples, which is the correct floor). PASS today.
- **5. `window.GAME: any`.** Already `GAME: Game` in `src/globals.d.ts`, and
  `browser.d.ts`'s URL wildcard is closed by a `tsconfig.tools.json` path
  mapping. `anycheck`: 0 in 0 of 534 files.
- **6. The 13 floating landmarks.** Already re-seated: `floatcheck` reports
  `poiFloating 0` against a pinned baseline of 0, gated, PASS; instance floats
  improved 362 → 355 (reported only). No re-seat needed, and the baseline was
  deliberately NOT re-taken — re-taking would only ratchet a reported-only
  number and risks overwriting the pinned zero.

## Handed over — other lanes own the files

`GeoAssert.ts`'s remaining build-time call sites. **Wrap each in try/catch +
`console.error`, never a bare throw** — an assert that throws inside `init()`
hangs the boot and every browser tool returns a bare `waitForFunction` timeout.

| assert | call site | owner | state |
|---|---|---|---|
| `assertUpward` | shore ribbon, river strip | `water-content` | **wired** |
| `assertCardOrientation` | hair / impostor cards | `head` | **wired**, guarded |
| `assertConsistentWinding` | the river hull, any closed body a generator emits | `water-content` | not wired |
| `assertAttributeContract` | any mesh built for a textured material | `landmarks` | not wired in a generator; gated in `geocheck` |

## Files touched

`src/tools/daemon.mts`, `geocheck.mts`, `reachcheck.mts`, `anycheck.mts`,
`creaturecheck.mts`, `driftcheck.mts`, `imagestats.mts`, `ui-shoot.mts`,
`_probe/hidephase.mts`, `_probe/scrimfix2.mts`, `_probe/scrimtone.mts`;
`project/must-run.json`, `project/LANDMINES.md`; `src/ui/ui.css`,
`src/ui/Menus.ts`.
