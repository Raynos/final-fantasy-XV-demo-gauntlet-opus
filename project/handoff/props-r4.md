# props-r4 — the ellipsoids, the aprons, and three things that were the instrument

**Owner:** the `props-r4` lane, 2026-08-28. **Owns** `src/world/props/`.
**Brief:** §WS-13's landmark and prop rows — the Meteor / `tintNorm`, the smooth
dark ellipsoids at `poi_tomb`, `_genOutcrop`, and `poi_imperial`'s levitating
boulder.
**Predecessors:** `project/archive/handoff/landmarks-r3.md` and
`project/archive/handoff/rockseat.md`. Nothing in either is redone here.

**§WS-13 is TERMINAL.** Nothing in this document is handed back. Every row below
is landed or closed with the number that closed it.

Every claim is marked **VERIFIED BY EYE**, **MEASURED** or **UNVERIFIED**.

---

## Row 2 — the smooth dark ellipsoids beside the tomb — **LANDED**

**Found, named, fixed, and then the class behind it fixed too.**

`probes/pixelowner.mts` (new) names it in one run: the blob at (820, 420) of
`poi_tomb` is `dungeon_poi_dark`, 239 vertices, `MeshStandardMaterial:poi_dark`,
maps **NONE**, parent `poi_dungeon_keycatrich_trench`. `_dungeon` built "the
mound the portal is cut into" as `SphereGeometry(9, 14, 8, 0, 2pi, 0, pi/2)`
scaled `[1, 0.62, 1]` inside a world matrix scaled 1.35 — a **12 m-radius,
7.5 m-tall grey ellipsoid** on `plain(0x6b6357, 0.94)`. Its own docstring
promised "a corbelled portal cut into a **rubble mound**" and the sentence
before it admitted what was there: "three `roughBox` slabs against a squashed
sphere". The slabs were fixed; the sphere was not.

It is in the *tomb's* frame because the Keycatrich Trench mouth stands **68 m**
from the Tomb of the Wise — `_exclude`'s own docstring is where that number
comes from. **The POI the coordinator was looking at is not the one that built
the defect**, which is why nothing in `_tomb` explained it.

- `f665959` — `kitMound`: three shapes from `rockGeometry` at `size: 9`,
  `detail: 3`, on `M.rock`; eleven pooled boulders seated on the ellipsoid's own
  flank (`y = h * sqrt(1 - (d/R)^2)`, sunk a third of their size). Crown kept at
  the hemisphere's own `-0.6 + 9 * 0.62 = 4.98`, so nothing above it moves.
  **Zero new draw calls** — `poi_tomb` 486 before and after (**MEASURED**).
  `tmp/p4/blob.png` -> `tmp/p4/blob2.png` (**VERIFIED BY EYE**).

Then the class, because `probes/blobcensus.mts` (new) counts it rather than
guessing: of 339 prop meshes streamed at `poi_tomb`, **180 are over 5 m on their
longest axis with no map of any kind**, and after shadow proxies and beacon
cards are excluded on `colorWrite === false` the two that are neither masonry
nor sky are `poi_gravel` (15 meshes, **271 676 m²** of bounding-box area,
**0.06 vertices per m²**) and `poi_ground` (8, 110 354 m², 0.05). Those are the
`gradePad` aprons. `fort_vaullerey` alone is 120 x 29 x 131 m on 1 365 vertices.

- `3e91f06` — `PropMaterials.groundMaterial`, and `M.ground` / `M.gravel` take
  it. The `plain()` argument it does not disturb is **an argument about walls**;
  an apron is not a wall and, decisively, **carries world-metre UVs** already
  (`gradePad` writes `uv.push(ct * s, st * s)` in metres). So `repeat = 1 / mpt`
  is a fixed texel density on a pad of any size and there is nothing to stretch.
  **The map is a mean-1.0 modulation, not an albedo**: `h`'s mean is measured
  over a 64² grid at build time and divided out, so the grade `gradePad` writes
  into `attributes.color` (deck 1.0 … scarp 0.58) is untouched and only the
  texture moves.

  Six POI shots, PNG both sides, HEAD against the tree: `poi_parking` **0.942**
  mean/255 over 1.14% of pixels, `poi_chocobo` 0.839/0.50%, `poi_haven`
  0.633/1.20%, `poi_imperial` 0.206, `poi_reststop` 0.054, `poi_menace` 0.052.
  Every mean is at or under that shot's own floor — the case `rockseat` recorded
  as **not** meaning "no change". Draw calls identical on all six.
  `tmp/p4/havA.png` -> `tmp/p4/havB.png` is the row (**VERIFIED BY EYE**): a
  smooth featureless brown ramp becomes a gritty stony hardstanding with pebble
  scatter, and the boulder lying on it now looks like it came out of it.

## Row 4 — `poi_imperial`'s levitating boulder, and the 16 open joints — **CLOSED, negative**

**The boulder is gone. VERIFIED BY EYE**: `tmp/shots/lr2-impp/rock.png` (a cap
with sky all round it and its own shadow on the block below) against
`tmp/p4/imp1.png`, the same tor at 6x today — one continuous mass with a shadow
seam at the joint and no daylight anywhere in it.

**None of the residual floats is visible in any judged frame** (**MEASURED**).
Getting there took fixing the instrument twice:

1. `probes/outcropjoint.mts` was reading its support off
   `Terrain.drawnHeightAt(x, z)` **with no `cell`**, which measures the ring the
   clipmap is parked on. 1 float of 2548 at `__OJ_CELLS=10`; 34 of 5488 at 14;
   33 of the 34 were the harness. Pinned to `clipSpacingForDistance(CULL[kind])`
   — the lattice `seatY` already seats against — the rate stops depending on the
   radius: **4 of 2866 (0.14 %) at 1 760 m, 8 of 5490 (0.15 %) at 2 464 m**
   (`8722340`). Landmine written up; see below.
2. All eight carry `bury = 0` (upper courses, not the course-0 blocks `_item`
   seats) and seven sit at the `_sc` aspect cap, `sy` 1.85 — the same population
   and roughly the same rate `stackjoint` reports from the pure-function side
   (16 of 6111, 0.26 %), reached independently off the placed triangles.
3. `probes/inframe.mts` (new, bare Node) then asks the only question that
   matters. Over the 92 shots that carry a pos/target pair, the largest apparent
   void is **28.8 px** in `zone_fallgrove` at 553 m — and that frame is a closed
   canopy with nothing at 553 m visible through it (**VERIFIED BY EYE**,
   `tmp/shots/p4-corpA/zone_fallgrove.png`) — and **18.9 px** in
   `dun_balouve_drift`, which is a **dungeon interior** where the outdoor rock
   field is not drawn at all (**VERIFIED BY EYE**). Every other one is
   **0.76 to 5.95 px**.

So the 16 open joints are a distributional tail that the world's 5 490 laid
courses contain eight of, none of them in a frame. `rockseat` already priced the
fix that closes them — 30 % of every tor's height — and rejected it. That
rejection stands and this is the visibility number it was missing.

## Row 3 — `_genOutcrop` is ungraded — **CLOSED: half landed, half a negative I agree with**

`rockseat` did not take the `outcropPlan(rng, rockS, ext)` extraction because
`_genOutcrop` reads `it.sx`/`it.sy`/`it.sz` back off `_item`, so a pure plan must
draw its own per-axis jitter, which **renumbers every outcrop in the world for a
testability win with no defect attached**. I agree, and I am closing it rather
than passing it on. The argument is stronger now than when it was written, for a
reason that is measured rather than rhetorical:

- **"Ungraded" is no longer true.** The grading half is landed and is the row
  above: `outcropjoint` now sweeps 5 490 laid courses over a 9.9 km square, on
  the lattice each block is actually drawn against, off the placed triangles,
  and reports **8 floats (0.15 %), none visible**. A `rock:outcrop` family in
  `silhouette.mts` would grade the *shape* of a generator whose defect rate is
  already measured at 0.15 % and whose visible defect rate is **zero**.
- **The renumbering is not free and the thing it would buy is already bought.**
  Every outcrop in the world changing seed is a corpus-wide diff to review, and
  the only new information on the other side is a bench for a generator that has
  a bench.

## Row 1 — the Meteor — **DECIDED (negative) on `tintNorm`; the glow is a measured negative with a named cost**

### `tintNorm` for the instanced field: **NO**, and the corpus is the proof

Built as a committed arm (`ec0c2bd`) and priced by **two cold 142-shot corpora,
`ec0c2bd~1` against `ec0c2bd`** — one commit apart by construction, because three
lanes were live and `Field.ts` was uncommitted in the shared tree, so a `--dirty`
corpus would have been measuring somebody else's heightfield. Reverted at
`b921642`, with the whole measurement in the comment on the call site.

- **The ablation is not null.** `tmp/p4/hlw`, the `zone_longwythe` heat map:
  every changed pixel is a rock. Terrain, sky, vegetation, clouds and the
  Insomnia skyline untouched (**VERIFIED BY EYE**).
- **No shot moves above its own noise floor.** Worst mean `party_formation`
  **1.814/255** against a floor of 2.85; `zone_longwythe` 0.680 over 0.097% of
  pixels (floor 1.23), `zone_three_valleys` 0.648/0.107% (0.74),
  `zone_mencemoor` 0.359, `zone_ostium_gorge` 0.439 (**MEASURED**).
- **The arithmetic is the finding.** Over the eight shipped kinds at their
  shipped `opts` the bake's means run **0.8731 to 0.9270, mean of means
  0.8966** — so `tintNorm` here is a **uniform ×1.1153 albedo lift** plus a
  **6.01%** inter-kind equalisation. A re-tint wearing a normalisation's name,
  on a material whose tint and per-instance range were both calibrated with the
  0.8966 in them. If we wanted every rock 11% brighter, the honest change is the
  hex (**MEASURED**, `tmp/p4/tint.mts`).
- **Looked at anyway**, because a mean under the floor is not "no change":
  `tmp/p4/lwA.png` -> `tmp/p4/lwB.png`, the Longwythe corestone at 3x. The lift
  is if anything slightly *worse* — normalising to the mean raises the cavity as
  much as the ledge, so the crevice shading flattens (**VERIFIED BY EYE**).

The Meteor is the opposite case and keeps it: there the material had **no**
large-scale albedo variation at all, so the attribute was new information rather
than a scale on information the tint already carried.

### The Disc at `zone_mencemoor`: it is the Meteor, and its glow has never rendered

`probes/pixelowner.mts` settles the first half: the pale dome at (760,180) of
`zone_mencemoor` is `meteor_mega_stone`, 723 960 verts, map+normalMap+
roughnessMap, vertex colours on, nearest corner **917.7 m**. It is the Meteor,
not a terrain feature, and it does carry every map it should.

The second half is a hard negative with a mechanism (`3eef135`).
`probes/meteorglow.mts` is a positive control: multiply `meteorGlow.emissive` by
**40** and re-shoot. **Not one lit pixel**, in `zone_mencemoor` or in
`landmark_meteor` (`tmp/p4/disc.png` -> `tmp/p4/discglow.png`, **VERIFIED BY
EYE**). The glow is not faint; it is inside the rock. `_meteorParts` authors a
cleft as the *midpoint between two neighbouring mass centres*, and the masses run
r 165–300 m at centres 300–360 m apart — the midpoint of two overlapping bodies
is the middle of both. All 22 slabs sit within ±204 m of the group origin while
the stone spans −1154 to +1085. So the night ramp `glows()` drives,
`1.6 + 1.4 * night`, has never rendered either.

**I built the placement fix and reverted it, because it does not close the row.**
Seating each slab on an actual vertex of a mass — rejected if inside another
mass's ellipsoid at 0.98 (buried again) or not inside one at 1.22 (not a seam) —
does move them onto the real cut surface: the glow group's box goes
[-204,-77,-165]..[189,257,199] -> [-231,28,-350]..[416,291,168]. **Still
invisible at 40x from both judged cameras**, for a reason of scale rather than
placement: a slab sunk to sit in a crack stands ~0.6 m proud and **one pixel at
`zone_mencemoor`'s range is 1.53 m**; and from that stand the frame is dominated
by the front mass, whose face is not a seam at all.

**What it actually needs, priced for the human:** glowing veins authored *across
the visible faces* on the cleave-plane edges the mass already has, at tens of
metres, sized for a 585 m landform. That is an art round with its own
before/after, not a nudge — and it would buy the Meteor its one warm accent and
give the night ramp something to drive. It is not queued anywhere; it is in this
lane's final report.

---

## Landed

| sha | what | state |
|---|---|---|
| `96c2a97` | `probes/pixelowner.mts`, `probes/blobcensus.mts` | **MEASURED** |
| `f665959` | `_dungeon`'s mound is rubble, on a mapped material | **MEASURED** + **VERIFIED BY EYE** |
| `3e91f06` | `groundMaterial`; the aprons and hardstanding stop being flat colour | **MEASURED** + **VERIFIED BY EYE** |
| `ec0c2bd` | EXPERIMENT: `tintNorm` on for the instanced field, to be priced | — |
| `8722340` | `outcropjoint` reads its support on the lattice the rock is drawn against | **MEASURED** |
| `1fbb12a` | `probes/inframe.mts`; the `drawnHeightAt` landmine | **MEASURED** |

## Rules this lane is carrying

- **`Terrain.drawnHeightAt(x, z)` with no `cell` is not "the true surface"** — it
  is the ring the clipmap is parked on, and the error is **monotone in the
  radius of your sweep**, so it reads as "the far half of the world is broken".
  Full entry in `project/LANDMINES.md`.
- **A total is a verdict and a list is a diagnosis.** `outcropjoint` reported
  "1 floating of 2548" for a round and gave nobody a way to ask what the one
  was. It returns the subjects now.
- **A `plain()` material is an argument about walls.** It has now failed twice
  on things that are not walls — a camp boulder (`c2e2295`) and a
  seventy-metre earthwork (here). Check whether the mesh has world-scale UVs
  before invoking it: if it does, the stretch objection does not apply.
