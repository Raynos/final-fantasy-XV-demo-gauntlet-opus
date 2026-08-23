# Procedural modeling — buildings, rocks, props

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` (sections 2.1, 3.1–3.3,
5.1–5.2, 5.5). Worktree `agent-a5c79a93a69d8b7cc`.

**`PORT=5390` was taken.** A vite from worktree `agent-af853a3898f7c38cd` already
owned it, so **every capture in this lane used `PORT=5394`** (daemon 5395). The
first hour of this session was spent shooting another agent's tree and believing
the frames: three captures came back byte-identical after real code changes
before `lsof -nP -iTCP:5390 -sTCP:LISTEN` explained why. **Check the port owner's
cwd before trusting a "nothing changed" capture** — `lsof -p <pid> | grep cwd`.

## The headline

`poi_fishing`'s buildings were flat dark slabs with a lighter top, one cuboid on
each roof for plant, and small pale rectangles floating on the wall plane for
windows. `zone_mencemoor`'s landmark — the Meteor of the Disc, which the whole
Cauthess region is named for — was an **eighty-triangle icosahedron**.

Both are fixed, and the cost of the whole lane, measured by checking
`src/world/{props,town}` back out at the merge-base (`d3491a4`) and capturing the
same four shots:

```
                 tris before        after        calls
poi_fishing        6,971,273    7,186,001  (+3.1%)   482 -> 487
zone_mencemoor     6,477,364    6,505,444  (+0.4%)   355 -> 355
town_wide          7,560,917    7,569,077  (+0.1%)   564 -> 564
town_forecourt     9,689,693    9,725,933  (+0.4%)   926 -> 926
```

Five extra draw calls, from the town group's four new render materials plus the
joinery, and they buy every facade in the game.

`npm run check`: **10/11**. The one failure is `anycheck` — 11 `any` in
`src/game/rpg/HavenCamp.ts`, another lane's file, predating this work.
`seatcheck.mts` still **PASS**, residual 0.000 m.

## What is done and verified

### `src/world/props/BuildKit.ts` (new) — architecture primitives

`box` (auto-chamfered, section-gated, arris marked in an attribute), `wallRun`
(pier/sill/lintel split around sorted openings — real reveals, no CSG),
`cornerPier`, `plinth`, `parapet` (coping + drip lip), `windowUnit`, `doorUnit`,
`stringCourse`, `plantUnit`, `roofTank`, `stairHead`, `container`, `bakeTone`,
`toneVariant`, `bag`/`mergeBag`. Human scale as constants: `STOREY` 3.2,
`DOOR_H` 2.1, `DOOR_W` 1.1, `CILL` 1.05.

Ported from `metal-gear-solid-5-opus-demo/src/world/outpost/{geo,buildings}.js`.
Every number in it was argued out over four rounds of critique *there*; the
docstrings carry the arguments rather than the numbers alone.

### Consumers

- **`PoiKits._block`** — the settlement block. Plinth, four elevations of real
  thickness with openings punched through, corner piers, string courses,
  parapet, roof deck, cased plant / stair head / tank, downpipes, awning.
- **`PoiKits._hut`** — outpost and reststop huts, with a monopitch roof, eaves
  overhang, fascia and rafters.
- **`PoiKits._containers`** — corrugated shipping containers.
- **`PoiKits._town`** market stalls — gabled awning, valance, counter, crates.

### `src/world/props/Rocks.ts` — the post-fracture finishing stack

Conjugate joint sets (bedding + two shear sets at 55°, dominant cuts last and
deepest), convexity-weighted chamfer/weathering Laplacian, strata that step the
silhouette (constant radius within a bed, jumping between beds, per-bed
resistance from the seed). New knobs: `weather`, `upBias`, `joints`, `size`,
`gully`, `gullyFreq`, `uvScale`. **`rockGeometry` is now exported.**

### `src/world/props/Megastructures.ts` — `shard()` is a rock

Built by `rockGeometry` at a detail the size justifies (2420 / 980 / 320
triangles), with gullies and a UV scale the eye can resolve at 1.5 km.

### Seating on the drawn surface (the handed-off item)

`src/world/props/Seat.ts` (new): `seatY` and `coverY`, the adapters over
`Terrain.seatHeightAt` / `drawnEnvelope`. Wired into **`Rocks._item`** (per-kind
cull distances in a `CULL` table), **`PoiKits._base`** (per-type draw radius) and
**`Debris._genCell`**. `seatcheck.mts` still passes.

## What is still short, in priority order

1. **Hammerhead (`src/world/town/`) is untouched.** It is already the most
   finished thing in the game — corrugated siding, roll doors, signage — so it
   was not where the placeholder read was. But its canopy soffit carries a
   mottled blue-green texture that reads as water caustics, the fuel pumps are
   white boxes with a red cap, and the diner's speckle texture is at gravel scale
   on furniture. `TownKit`/`TownMaterials` would take the `BuildKit` retrofit
   straightforwardly.
2. **The Meteor is better but still the weakest landmark.** It reads as a
   mountain-sized rock now rather than an eighty-triangle polyhedron, but the
   silhouette is a dome. What it wants is *several overlapping masses* rather
   than one, and clefts at 30–50 m. `gully` is implemented and tuned by eye
   only; nobody has measured whether it earns its lines.
3. **Remaining `eco.height` placement sites**: `Landmarks.ts` (8),
   `RoadFurniture.ts` (13), `Outposts.ts` (8), `Wildlife.ts` (10),
   `Megastructures.ts` (3). Road furniture is the interesting one — it is a
   *chain* of heights along a corridor and wants `coverY` for the decals and
   `seatY` for the posts, which is two different bounds in one file.
4. **Grass grows through the town plaza and the outpost pads.** The POI kits
   publish `_exclusions`; something downstream is not reading them at the pad
   radius. Not diagnosed.
5. **The 124 POI aprons are still "cake stands"** — a faceted drum with a spoil
   ring. Plan section 5.4 (cut-and-fill pad that measures its own fill, truckable
   ramp written back into the road corridor, SDF wobble) is unstarted.
6. **`_imperial`, `_tomb`, `_landmark`, `_dungeon`, `_chocobo`, `_menace`, and
   `_haven`** still build from bare `BoxGeometry`. `_block` and `_hut` are the
   templates; the tomb in particular is the kit that "most has to read from a
   kilometre away" by its own docstring.

## Traps this lane hit, so the next one does not

- **`mergeGeometries` returns `null` on an attribute mismatch, silently.** Not
  an exception, not a log — a whole building disappears. `BuildKit.mergeBag`
  normalises index, UV and `aArris` before every merge.
- **A material with `vertexColors` and no `color` attribute draws black**, because
  GLSL reads an absent attribute as zero. `PartBuilder.build` now synthesises
  white for any piece in a batch whose material wants colour.
- **The rock generator's vertex bake has a mean around 0.55.** Turning
  `instanceTint` on for a material not calibrated for it halves its value —
  it rendered the Meteor near-black.
- **`rockGeometry` normalises to a bounding radius of `size`**, and the joint cuts
  then take about a third of that back. Callers who want a specific extent must
  oversize.
- **Cutting the bedding plane from both ends turns every block into a disc**, for
  the same reason. It removed two of the three boulders in `poi_fishing`.
- **`bedding` is a fraction of the radius, not of the bed height.** Eight beds at
  0.13 on a 500 m mass are 35 m cliffs.
- **`arrisLift` above about 1.1 draws dotted lines.** A coping's chamfer seen
  near edge-on is a pixel wide, so a 20% brightening lands on a broken run of
  single pixels and stitches a dashed line across the facade.
- **Framing a POI needs the terrain height first.** Most POI kits have no shot in
  the corpus at all. `src/tools/probe.mts` + `framecam.mts` is the loop; probes
  are evaluated as **plain JS function bodies**, so no `import` statements and no
  type annotations.
- `tsconfig.tools.json` carried a `baseUrl` that TypeScript 7 removed, which
  failed `typecheck:tools` and therefore the pre-commit hook in **every**
  worktree. Removed in `5483624`.

## Shots that show the current state

- `tmp/shots/BASE/` vs `tmp/shots/AFTER/` — the four cost-measurement pairs.
- `tmp/shots/quay6/quay_square.png`, `quay_base.png`, `quay_far.png` — Galdin
  Quay at eye level and as a skyline. These are the frames to grade against.
- `tmp/shots/rest2/` vs `tmp/shots/rest3/outpost_prairie.png` — huts and
  containers, before and after.
- `tmp/shots/r0h/zone_mencemoor.jpg` — the ablation that proved the Meteor was
  `Megastructures`, not `Rocks`. `tmp/shots/r9/` is where it ended up.
- `tmp/shots/seat/poi_fishing.jpg` — after re-seating.

Framings live in `tmp/cand.json` and `tmp/cand2.json` (both disposable).
