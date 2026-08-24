# Town lane — buildings, POI kits, wear and pads (plan §5.2–5.5)

Files owned: `src/world/town/**`, `src/world/props/{PoiKits,Outposts,Landmarks,
Megastructures,RoadFurniture,PartBuilder,BuildKit}.ts`, new
`src/world/props/Wear.ts`. Previous round on the same files:
`project/handoff/modeling.md` — read it too, this one does **not** repeat it.

Seven commits, `4a5ca39` .. `35f0bb8`-ish (`git log --author="Jake Verbaten"
-- src/world/props/Wear.ts` finds the range).

---

## What landed and is verified

### §5.4 — wear as a distance field, and the pad as a measured earthwork

`src/world/props/Wear.ts` is new. Two halves, plus the check.

- **`WearField`** rasterises wear at 0.5 m/texel and stores a **distance ramp**,
  never a mask. `texture()` hands it to the GPU as R8 with `LinearFilter`;
  `sampleInto()` multiplies it into a geometry's vertex colours.
- **`applyWear`** patches a `MeshStandardMaterial` — not a `ShaderMaterial`, so
  the surface keeps fog, shadows and the atmosphere patch — and samples **world
  XZ**, not `uv`, because the material already uses `uv` for its own tile.
- **`gradePad`** replaces `PoiKits._apron`'s faceted drum for all 124 POIs.
  Level deck, 1:3 fill, 1:1.5 cut, a 1:9 ramp graded down the road bearing,
  spoil berms on the crest isoline, an outline wobbled by two octaves of angular
  noise, and a toe that buries itself under the drawn terrain by a
  noise-varying depth so the fill fingers out into the grass. It measures its
  own cut and fill in m³ (`PoiKits._padStats`).
- **`desireLine`** walks the paths, and each kit names its own destinations —
  the reststop's are the two pump islands and the shop door.

**The measured claim, and it is the item's whole point.** `reconstructionTest`
sweeps 64 path phases across a lattice cell and reports both encodings:

| path | lattice | mask mean | mask worst | field mean | field worst |
|---|---|---|---|---|---|
| 1.5 m | 1.7 m | 0.891 | **0.000** | 1.000 | **1.000** |
| 1.0 m | 2.0 m | 0.516 | **0.000** | 1.000 | 1.000 |
| 1.5 m | 1.5 m | 1.000 | 1.000 | 1.000 | 1.000 |
| 2.5 m | 1.7 m | 1.000 | 1.000 | 1.000 | 1.000 |
| 1.5 m | 0.8 m | 1.000 | 1.000 | 1.000 | 1.000 |

Run it with `node src/tools/probe.mts <file>` where the file is
`const W = await import('/world/props/Wear.ts'); console.log(JSON.stringify(W.reconstructionTest(1.5, 1.7)));`.
The last three rows are the **known-answer control**: when the lattice is finer
than the path, or the path is wider than the lattice, a mask recovers perfectly
too and the check correctly declines to claim an advantage. Only rows 1 and 2
are the case the plan is about.

The **first version of this check was an instrument measuring its own phase** —
one offset, one number, "pass" or "fail" depending on where the lattice happened
to fall. That is recorded in the commit and is worth reading before writing the
next check in this repo.

**Where the field is carried, and why it differs per surface:**

| surface | carrier | why |
|---|---|---|
| Hammerhead's asphalt pad | **texture** (`applyWear`) | one pad, one material, no extra draw |
| 124 POI aprons | **vertex colour** (`sampleInto`) | a per-place field means a per-place material, and a material split is a draw call |

That is a deliberate departure from the plan's "as textures" and it is defended
by the same number the plan defends everything with: cost is draws. **The
encoding is what survives the lattice, not the carrier** — a ramp interpolates
linearly across a triangle exactly as it did across a texel.

### §5.1/§5.2 — the seven `BoxGeometry` kits

All seven are rebuilt on `BuildKit`. `roughBox` (a box with 3% Gaussian vertex
noise) now has no callers and is deleted — jitter on a box's vertices moves its
corners, it does not give it any.

- **`_tomb`** — crepidoma of three steps, columns with plinth / torus base /
  three-drum entasis / echinus + abacus, architrave → recessed frieze with
  triglyphs → cornice with drip lip, a pediment whose tympanum sits back inside
  its raking cornices, gabled roof with a ridge course, acroteria, a cella whose
  doorway is punched by `wallRun`. `bakeTone` on the finished merge.
- **`_imperial`** — every wall bay is a `wallRun` of real thickness with an
  embrasure, on a plinth, capped with coping + drip lip + merlons and buttressed
  by a pier at each joint; breaches carry rubble. Gate with plinthed pylons, a
  gantry and a lifted barrier. X-braced watchtowers with railed catwalks and
  ladders. Segmental-vault hangar with ribs and a door with real jambs. Landing
  pad on a chamfered kerb with edge lights and chevrons. Three sandbag
  emplacements. Two masses: pale concrete wall, dark magitek trim.
- **`_haven`** — two-course shelf with a wobbled plan and a nosing, a **solved**
  tent, a tarp over the stores, camp chairs, a bedroll, a pot on a tripod.
- **`_menace`** — kerbed dished court, trilithons with lintels, a stair down.
- **`_dungeon`** — jambs that corbel forward, a lintel with a relieving course
  and a capping with a drip lip, a reveal lining set back inside the jambs.
- **`_chocobo`** — board-and-batten barn with stepped gables, barge boards, two
  roof planes off a ridge, a sliding door on a rail, a loft door and hoist beam.
- **`_landmark`** — stele on a two-course base, cairn as a cone, bench with real
  legs; the lighthouse banded at every storey with a galleried lamp room.

### §5.3 — soft goods, in `BuildKit`

- **`membraneSag`** — Jacobi relaxation of a pinned grid, solved twice
  (unloaded = discrete minimal surface = the cusps; loaded = the Poisson solve),
  the difference rescaled so the **maximum deflection is exactly the requested
  sag** whatever the span or pin layout.
- **`tarpEnvelope`** — the `max` of rounded-box lumps, not the sum. `max` is
  what produces a ridge line between two crates; `sum` is a bin bag.
- **`sandbagStack`** — superellipse bags, load-accumulated course dip,
  alternating bond, 7% rogue.

Wired into `_haven` (tent, tarp), `_chocobo` (hay tarp), `_imperial` (three
emplacements). **Not yet wired into `Outposts`, Hammerhead's clutter or the
caravan** — see *What is left*.

### §5.5 — `PartBuilder.prep`

Exported, with the KEEP list, index and attribute synthesis. The part that was
actually wrong is fixed: a piece with no UV used to get **zeros**, which makes
the merge succeed and makes that piece sample one texel of its map for ever —
§9.5's "undeclared attributes read as zero" arriving *through* the fix. It is a
planar projection on the two widest axes now. `build` no longer swallows a null
merge: it warns and ships the pieces unmerged.

Our `aVar` equivalent already existed and is `BuildKit.bakeTone`, which stamps
per-object value / warmth / grime / chamfer-lift into `attributes.color` before
the merge and on the finished, placed piece.

---

## The two open items from the previous handoff — both answered

### 1. "Grass grows through the town plaza and the outpost pads"

**Diagnosed, and the previous handoff's premise was wrong.** It says "the POI
kits publish `_exclusions`; something downstream is not reading them at pad
radius". `PoiKits._exclusions` has nothing to do with vegetation — it is a list
of places *another system already builds*, used to stop `PoiKits` double-building
over a dungeon entrance or the town. Nothing in `src/world/veg/` has ever read
it and nothing should.

The real consumer is `Ecology`, and the defect is one line long:

```
src/world/veg/Ecology.ts:545   treeDensity:   d *= 1 - this.poiClear(x, z);
src/world/veg/Ecology.ts:481   grassDensity:  d *= 1 - this.siteBlock(x, z);   // no poiClear
src/world/veg/Ecology.ts:507   scrubDensity:  d *= 1 - this.siteBlock(x, z);   // no poiClear
```

`poiClear` is read by `treeDensity` **and by nothing else**. `siteBlock` only
covers the handful of landmarks `Vegetation` authored near the origin. So grass
and scrub have never known that the 124 POIs exist.

Two further findings in the same table, `Ecology._layoutClearings`'s `FRAC`:

- It has **no entry for `tomb` or `landmark`**, and `if (!f) continue`, so those
  two types get no clearing at all — not even for trees. That is why
  `tmp/shots/kits-r0b/poi_tomb_just.png` has trees standing against the
  colonnade and why `tmp/shots/kits-r10/poi_costlemark_menace.png` is a lair in
  a wood.
- `poiClear` returns a **linear ramp** `1 - d/r`, so density is only zero at the
  exact centre. A pad wants a flat-topped falloff — full clearance out to the
  apron toe, then a ramp — or the plaza is half-grassed by construction.

**This is `src/world/veg/Ecology.ts`, which the scatter lane owns and I do not.**
The request, in order of value:

1. `grassDensity` and `scrubDensity` multiply by `1 - poiClear(x, z)`.
2. Add `tomb: 0.35, landmark: 0.12` to `FRAC` (landmarks include Longwythe Peak
   at r = 520, which is why the table excluded them — 0.12 is ~60 m).
3. Make `poiClear` flat-topped: `min(1, (1 - d/r) * 2.2)` or similar.

`PoiKits` can publish the pad's real toe radius if that helps — `gradePad`
returns it and `_padStats.toe` records it; say the word and I will add a
`clearRadius(x, z)` to `PoiKits`.

### 2. "`RoadFurniture` writes `RoadSample.y` and nothing reads it"

**Verified dead, and deleted.** The trap that made it look alive is worth
recording, because it is why the last two rounds left it: there are **three
different `RoadSample` interfaces** in this repo (`props/RoadFurniture.ts:84`,
`map/RoadGraph.ts:281`, `game/cinematics/RoadPath.ts:6`) and a fourth anonymous
`{x, z, y}` local inside `_guardrail`. Grepping `\.y` in `RoadFurniture.ts`
returns four hits and three of them are *other types* — `RoadGraph`'s sample at
line 206 and the guardrail's own local at 308 and 316. Only line 233 touched the
field, and it was the write.

It cost one `Ecology.height` call per sample per built chunk and returned
nothing to anybody. The field, the write and the docstring's claim are gone; the
docstring now carries why the grep lied.

---

## §5.2 — the human-scale audit, measured

The plan's numbers, and what our code actually does. This is the table the brief
asked for; **it is a source audit, not a page probe.**

| constant | plan | `BuildKit` | Hammerhead | POI kits |
|---|---|---|---|---|
| storey, floor to floor | 3.2 m | `STOREY = 3.2` | **not used at all** | `_block`, `_town` |
| door leaf | 2.1 × 1.1 m | `DOOR_H`/`DOOR_W` | diner 2.2 × 1.15, garage office 2.1 × 1.0 — **pass** | `_hut` 2.05 × 0.95, `_block` 2.25 × 1.35 |
| window cill | ~1.05 m | `CILL = 1.05` | diner stub wall tops at **1.345 m** (+28%); garage office window cill at **1.83 m** (+74%) | `_block` 1.05 / 1.33 |
| parapet coping + 50 mm drip lip | required | `parapet()`, lip 55 mm | **absent on every building**; only the canopy fascia has a lip | `_block`, and now `_tomb`/`_imperial`/`_dungeon` |
| plinth with buried footing | required | `plinth()`, 4 courses | **absent on every building** — the diner, garage and shop walls start at y = 0.3 on the pad with no course between | `_block`, `_hut`, `_imperial`, `_chocobo`, lighthouse |

**The headline: `src/world/town/` uses none of the §5.2 constants and none of
the §5.1 primitives.** `grep -n "STOREY\|DOOR_H\|CILL\|plinth(\|parapet("
src/world/town/*.ts` returns nothing. So does the same grep over `Outposts.ts`,
`Landmarks.ts`, `Megastructures.ts` and `RoadFurniture.ts`. Hammerhead's own
dimensions are mostly *right in kind* — a diner's eaves at 3.9 m and a garage's
at 5.6 m are set by use, not by storeys, and the door leaves are within 5% —
but the two window cills are 28% and 74% high, which is precisely the "get the
human scale wrong by 20% and the compound reads as a toy" failure, and no wall
in the town stands on a plinth.

**This is the next piece of work in this lane and it is not started.**

---

## Cost — and why I cannot give you the table the previous round gave

The previous round's bar is **+0.33% triangles and one extra draw across nine
shots**. I cannot reproduce that measurement tonight and it is worth saying
exactly why, because the answer is not "I did not try".

`town_forecourt`'s draw count on `main`, all at HEAD, over roughly one hour:

| sha | calls | triangles |
|---|---|---|
| `2af3dfc` (start of my session) | 1037 | 12.32 M |
| `592ebd0` | 1057 | 11.51 M |
| `300eb82` (= my commit `9c083de`) | 1486 | 14.75 M |
| a later HEAD | 1493 | 15.19 M |

Six lanes are committing to this trunk every few minutes, so **a before/after on
HEAD attributes nothing**. My two `--hide poi_kits` ablations both landed on a
*different* sha from their control (`8eef914` vs `592ebd0`; `d3b206a` vs the
1493 run) and are therefore worthless — the harness README's own warning,
arriving from the direction I did not expect.

What I *can* say, measured directly in the page at `town_forecourt`:

```
VISIBLE 7 POI groups, 46 meshes total, 0 shadow casters
hammerhead_layby  parking   347 m   9 meshes
longwythe_rest    reststop  529 m  12 meshes
5 x landmark      943-1423 m  5 meshes each
```

**46 draws is the whole of `poi_kits` in that frame.** It cannot be the source
of a 400-draw swing. Per-POI, against the old kits' material sets:

| kit | old materials | new meshes | delta |
|---|---|---|---|
| parking | 10 | 9 | **−1** |
| reststop | 14 | 12 | **−2** |
| landmark | 4 | 5 → **4** after `35f0bb8` | **0** |

So this lane's POI work is **net draw-neutral to slightly cheaper** at
Hammerhead, and the +429 between `592ebd0` and my commit is not explained by it.
The honest next step for whoever picks this up is a **pinned** ablation: two
captures at one `--build <sha>`, `--raw` on both, `--hide poi_kits` on one. The
daemon would not hold a lease long enough for me to land it (see below).

`Wear.ts` adds no material and no mesh: the pad geometry replaces the drum
one-for-one and the wear rides in the vertex colours it already had.
`applyWear` on Hammerhead's asphalt mutates the existing `M.asphalt`, so it adds
**zero** draws — that is the reason it is only used there.

---

## Unverified, and why

**The harness stopped serving.** From roughly the last hour of this session,
`daemon.mts --health` reports `uptimeSec` under 15 on every poll — it is
restarting continuously — and `shoot`, `probe` and `floatcheck` all fail with
`ECONNRESET` or a 300 s `preparePage` timeout, on `--dirty` **and** on committed
shas including `hero_full`. `cleanup.mts` reports clean. This is not one lane's
build: `hero_full` at a committed sha does not boot either.

So the following are **committed but not re-measured**:

1. **The `floatcheck` fix.** The coordinator bisected 13 floating POI compounds
   to my `3d1e075`, correctly. Two causes, both mine, both fixed in `d0b1f27`:
   - `_base` used `coverY` (the *upper* envelope) on the reasoning that "a pad
     is the ground". True of the apron, false of the compound standing on it —
     and `coverY` is chosen from the kind's cull distance, 1300 m for a tomb, so
     the deck came out metres above the surface a player walks on. Back to
     `seatY`. The **grid** of 37 probes and the 88th percentile stay: those were
     the fix for the hummock punching through the menace's court and they are
     orthogonal to which envelope you sample.
   - `gradePad`'s batter is capped at `1.15 r + 6` for composition, and on a
     steep site the 1:3 fill ran out of cap before it ran out of hill, so the
     earthwork's lowest point was still in the air. The outermost station now
     **always** meets the ground whatever slope that takes.

   **Run `node src/tools/floatcheck.mts` first thing.** If it is still red, the
   remaining suspect is `_base`'s `+2.4 m` upward clamp against `h0`.

2. **The five-round capture review the brief asks for.** I got four rounds on
   the pads and kits (`tmp/shots/kits-r0b`, `r7`, `r9`, `r11/r12`) and read every
   frame. I did **not** get a round on `town_*` after the Hammerhead pad change.

3. **`pnpm run check`.** Not run. Blocked on the daemon.

---

## Two visual defects the coordinator raised, and what I found

### The garage sign

`tmp/shots/sign/sign.png` shows **"SOPHIAR" in the correct left-to-right order
with each glyph mirrored vertically**. I could not resolve it and I am recording
the analysis rather than guessing, because a blind flip here is exactly
"re-tinting before ablating":

- `Hammerhead.ts:687` `put(M.signGA, plane(6.0, 1.7), [...], [0, Math.PI, 0])`.
  A 180° yaw moves the plane; it does **not** mirror V. It mirrors U, which
  would give `RAIHPOS`, and the crop does not show that.
- `signMaterial` sets `side: DoubleSide`. Seeing the *back* face would also give
  `RAIHPOS`. So we are seeing the front.
- `garageSignTexture` draws SOPHIAR at `y = 0.44 s` and `EST. M.E. 736` at
  `0.84 s`; the crop shows them in that same top-to-bottom order, so the texture
  as a whole is **not** upside down.

A rigid transform cannot produce "right order, right vertical placement, each
glyph flipped". Either the crop is showing something other than the sign plane
(the fascia board at `H + 0.74` is 20 mm away and the roof is tilted `-0.06`
into it — z-fighting between the two would look like this), or `canvasTexture`'s
mip chain through `bakedCanvasMips` is inverting a level. **The experiment:**
`crop.mts` the same region with `--hide` on the fascia, and separately capture
the texture on a flat quad in a blank page. `signCN` is placed identically and
should be checked at the same time — if the cause is in the helper, every sign
in the world has it and only this one is framed.

### The forecourt "bathroom tiles"

The hardstanding is `M.slab` at `TEXEL` 7.0 m/tile, laid as three boxes
(`Hammerhead._ground`, `put(M.slab, box(20, 0.34, 15), ...)` and two more).
`slabMaterial` is at `TownMaterials.ts:120`. Two candidate causes and they need
separating before either is touched: (a) the tile itself contains a bay grid
with too much value contrast, in which case it is a `slabMaterial` fix; (b) 7 m
is too large a bay so the joints read as a checker rather than as scored lines,
in which case it is a one-number `TEXEL` change. **Ablate: re-bake `town_slab`
at 3.5 m and capture, before editing the texture.** Note that changing
roughness or metalness invalidates the texbake key silently —
`node src/tools/texbake.mts --force` after any material edit, and that rewrites
the cache every tree shares.

The corrugated-siding shimmer is `handoff/modeling.md`'s open item 6, now
visible on the flat as well as the canopy roof. Untouched.

---

## What is left, in priority order

1. **`floatcheck` green.** Committed fix, unverified. Nothing else matters until
   this is confirmed.
2. **The pinned draw-call ablation** described above, and then the nine-shot
   cost table in the previous handoff's format.
3. **§5.2 on Hammerhead**: plinths with buried footings on the diner, garage and
   shop; a coping and drip lip on each; the two window cills down to ~1.05 m.
   `BuildKit.plinth` and `BuildKit.parapet` already do all of it and the town has
   never called either.
4. **Soft goods into the remaining callers**: `Outposts` (camo net over the
   containers, sandbags round the mast), Hammerhead's clutter (an awning over
   the shop front, a tarp over the pallet stack), the caravan.
5. **The garage sign and the slab tiling** — the two experiments above.
6. **Wear on Hammerhead's *concrete*, not just its asphalt.** `_wearPad` covers
   the tarmac; the hardstanding under the canopy is where the oil actually is.
7. **The corrugation edge alias** (`handoff/modeling.md` item 6).

## Requests to other lanes

- **scatter / trees (`src/world/veg/Ecology.ts`)** — the three-part `poiClear`
  fix in §"Grass grows through" above. This is the single largest remaining
  visual defect at every POI in the game and it is three lines in a file I do
  not own.
- **coordinator** — `src/game/Shots.ts`: `poi_tomb`, `poi_haven`, `poi_menace`,
  `poi_chocobo` and `poi_dungeon_mouth` are all documented "(pad only)" and
  frame the *terrain* at those sites, not the kit. `poi_tomb` in particular was
  aimed at `tomb_wise`, which until `9c083de` was never built at all. They
  cannot review this lane's work as they stand. I used
  `src/tools/dresscam.mts poi:<id> --dist 60 --eye 30 --look 6 --yaw 205`
  instead, which does frame them; the shots directory to compare against is
  `tmp/shots/kits-r0b` (before) versus `kits-r11` / `kits-r12` (after).

## Shots that show the current state

| what | before | after |
|---|---|---|
| haven — the cake stand | `tmp/shots/kits-r0b/poi_alstor_haven.png` | `tmp/shots/kits-r9/poi_alstor_haven.png` |
| tomb — the white shed | `tmp/shots/kits-r0b/poi_tomb_just.png` | `tmp/shots/kits-r11/poi_tomb_just.png` |
| imperial — the ring of slabs | `tmp/shots/kits-r0b/poi_aracheole.png` | `tmp/shots/kits-r7/poi_aracheole.png` |
| menace — the coaster | `tmp/shots/kits-r0b/poi_costlemark_menace.png` | `tmp/shots/kits-r12/poi_costlemark_menace.png` |
| chocobo barn | `tmp/shots/kits-r0b/poi_wiz_chocobo.png` | `tmp/shots/kits-r12/poi_wiz_chocobo.png` |

Two measured negatives worth keeping, both photographed:
`tmp/shots/kits-r3/poi_tomb_just.png` (a `CylinderGeometry(0.01, r, h, 3)` is a
pyramid, not a prism — it put a spike through the roof) and
`tmp/shots/kits-r6/poi_aracheole.png` (a true half-cylinder vault of the
building's own width stands as tall again as the building).

## Honest grades

The bar to beat was **Hammerhead 6.5/10, Insomnia 6/10**, and the previous round
named what separates ours from shipped FFXV: *"dressing density and wear
placement… ours has correct materials at correct scale on clean geometry."*

- **The POI kits: 3/10 → 6/10.** They were seven flat-shaded box stacks on
  extruded drums. They now have chamfered arrises, real reveals, plinths,
  copings with drip lips, baked tone, and earthworks that meet the hill instead
  of standing on it. What still separates them from shipped FFXV is the same
  sentence as last round, one layer down: the *geometry* is right and the
  **dressing is thin**. A real imperial base has cabling on every wall, crates
  and drums against every corner, a vehicle, laundry, aerials and antennae; ours
  has three emplacements and six drums. The tomb has no offerings, no rope, no
  chain, nothing anyone left there.
- **Hammerhead: 6.5/10, unchanged and unverified.** The pad's UV defect is
  fixed and the wear field is stamped, but I never got a `town_*` capture after
  it. Do not take the fix on trust; it is exactly the shape of claim
  `LANDMINES.md` exists to catch.
- **The wear model itself: 7/10.** The distance-field argument is right, the
  measurement supports it, and the desire lines land where people would walk.
  What is missing is *specificity* — FFXV's wear is authored per place and ours
  is generated from three destinations per kit. The forecourt's tyre arcs are
  the one place it reaches the reference, and only because the arc was written
  by hand.
