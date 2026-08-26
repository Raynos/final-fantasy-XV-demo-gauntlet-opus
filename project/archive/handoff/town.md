# Town lane — buildings, POI kits, wear and pads (plan §5.2–5.5)

Files owned: `src/world/town/**`, `src/world/props/{PoiKits,Outposts,Landmarks,
Megastructures,RoadFurniture,PartBuilder,BuildKit}.ts`, new
`src/world/props/Wear.ts`. Previous round on the same files:
`project/handoff/modeling.md` — read it too, this one does **not** repeat it.

Nine commits, `d8f1da7` .. `02ca60c`. Every agent on this trunk commits under
the same git author, so `--author` will not separate them; `git log --oneline --
src/world/props/Wear.ts src/world/props/PoiKits.ts src/world/props/BuildKit.ts
src/world/props/PartBuilder.ts src/world/town/Hammerhead.ts` is the range:

```
d8f1da7  POI aprons become measured earthworks, and the royal tomb becomes a temple
6691bb5  The imperial base gets a perimeter, not a ring of slabs
dedfc27  Soft goods that are solved rather than authored, and the haven that uses them
3d1e075  The last four BoxGeometry kits, and pads that stop being punched through
9c083de  prep() before the merge, per-kind POI exclusions, and a check that stops
         measuring its own phase  (+ Hammerhead's asphalt pad)
7ddd95b  Fix 13 POI compounds standing in the air, and say which inference was wrong
8a53995  One material for the waymark stele: 23 landmarks, 23 draw calls
4d01ecd  Seat POIs at the range their base is read, not the range they are drawn
02ca60c  The sign is not upside down, and the handoff  (+ RoadSample.y removal in 8b0…)
```

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

## Cost — the nine-shot table, and a contradiction in it

Measured at HEAD `c0689df`, `--jpeg`, all nine in one run:

| shot | triangles | calls |
|---|---:|---:|
| `town_wide` | 8,156,144 | 644 |
| `town_forecourt` | 10,956,808 | **991** |
| `town_diner` | 10,985,483 | 893 |
| `town_garage` | 11,868,267 | 974 |
| `town_shops` | 10,839,679 | 969 |
| `poi_reststop` | 11,152,020 | 988 |
| `poi_haven` | 8,850,571 | 604 |
| `poi_tomb` | 8,500,638 | 525 |
| `landmark_insomnia` | 7,844,789 | 400 |

**`town_forecourt` is 991 against a budget of 800 and that is still over.** The
previous round's table had it at 917 and the coordinator measured 1037 mid-way
through tonight.

**I could not produce a clean before/after and the reason is worth recording,
because it is a trap this harness can spring on anyone tonight.** Six lanes are
committing to this trunk every few minutes, and the same shot at HEAD read:

| sha | calls | triangles |
|---|---:|---:|
| `2af3dfc` (session start) | 1037 | 12.32 M |
| `592ebd0` | 1057 | 11.51 M |
| `300eb82` | 1486 | 14.75 M |
| `cd1d78e` | 1430 | 14.28 M |
| `c0689df` | 991 | 10.96 M |

A ±450-call swing between neighbouring commits swamps anything one lane does, so
**a before/after on HEAD attributes nothing.** My first two `--hide poi_kits`
ablations each landed on a *different* sha from their control and were worthless
— `shoot.mts` resolves `HEAD` per invocation. **Pass `--build <explicit sha>` to
both halves of any A/B tonight.**

### The pinned ablation, and why its answer cannot be right

Both halves at `sha:cd1d78e6a3c8`, `--raw` on both:

| | triangles | calls |
|---|---:|---:|
| `town_forecourt` | 14,279,562 | 1430 |
| `town_forecourt --hide poi_kits` | 10,331,614 | 1081 |
| **difference** | **3.95 M** | **349** |

And an in-page count of the *same frame*, from `PoiKits.built` after
`applyShot('town_forecourt')`:

```
VISIBLE 7 POI groups, 46 meshes total, 0 shadow casters
hammerhead_layby  parking   347 m   9 meshes
longwythe_rest    reststop  529 m  12 meshes
5 x landmark      943-1423 m  5 meshes each
```

**349 draws against 46 meshes is a factor of 7.6, and 3.95 M triangles against
seven small compounds is not plausible either.** One of those two numbers is not
measuring what its name says. The most likely candidate is that `--hide
poi_kits` matches more of the scene graph than `PoiKits.root` — that is a
`src/tools/` question and I do not own that file. **Reconcile these before
acting on either.** Until that is done, "the POI kits cost 349 draws" is not a
finding, it is an unexplained disagreement.

### What *is* established about this lane's cost

Per-kit, counting materials in the source against meshes in the page:

| kit | old materials | new meshes | delta |
|---|---:|---:|---:|
| parking | 10 | 9 | **−1** |
| reststop | 14 | 12 | **−2** |
| landmark | 4 | 5 → **4** after `8a53995` | **0** |

`Wear.ts` adds no material and no mesh anywhere: `gradePad`'s geometry replaces
the drum one-for-one, and `applyWear` mutates the existing `M.asphalt` so
Hammerhead's wear field costs **zero** draws. That is the entire reason the 124
aprons carry their field in vertex colour instead.

### The class of bug, not the instance

`8a53995` was one material for a decorative cap on a kit that exists **23
times**. The general rule this lane now works to, and the one worth writing into
`LANDMINES.md` if it is not there:

> **A material is a draw call, and a kit's material count is multiplied by its
> population.** A second colour on a one-off building is free; the same second
> colour on a landmark, a parking bay or a haven is 23, 23 and 17 draws. Decide
> a role's material by *how many of this kit exist*, not by how it looks in
> isolation — and if two roles want the same material, map them to the same
> material and `PartBuilder` merges them into one mesh for nothing.

## The floating tombs — cause, fix, and where the gate stands

The coordinator bisected 13 floating POI compounds to my `3d1e075` and sent a
theory (an origin-convention mismatch between `BoxGeometry` and `BuildKit.box`).
**That theory was wrong and the evidence says so:** `_block` and `_hut` were
already seating correctly with the same primitives, and the kits that floated
included `river_wennath`, which my commit did not touch. There were **four**
causes, all in `_base` and `gradePad`, all about *which seat envelope at which
range*:

1. **`_base` used `coverY`**, the *upper* envelope, on the reasoning that "a pad
   is the ground". True of the apron, false of the compound standing on it —
   and `coverY`'s ring is chosen from the cull distance, 1300 m for a tomb, so
   the deck came out metres above the surface a player walks on. Back to
   `seatY`. **13 -> 12.**
2. **`gradePad`'s batter could stop in mid-air.** Its reach is capped at
   `1.15 r + 6` for composition, and on a steep site the 1:3 fill ran out of cap
   before it ran out of hill. The outermost station now always reaches for the
   ground. **-> 1 floating.**
3. **…and reaching without a limit was the same mistake with the sign flipped.**
   A pad clipping a cliff found ground fifty metres down and hung a fifty-metre
   curtain off its edge, which `floatcheck` reads as a compound buried 56 m into
   the hill (`disc_overlook`, `greyshire`, `crestholm`). Capped at
   `max(6, r / 2)`. **poiBuried 23 -> 18.**
4. **`_base` was being handed the *draw* distance.** `handoff/modeling.md` had
   already written down that "a cull distance for `Seat` is the range at which
   the object's BASE is read, not the range at which the object is visible" —
   and then left `_make` passing `DRAW_BY_TYPE` straight into `_base`. A
   landmark on a summit was seated on the lower envelope at **1500 m**, and a
   coarse ring's chord cuts tens of metres under a sharp peak: `longwythe_peak`
   was 38.82 m into the ground with a 4.6 m stele on it. `SEAT_BY_TYPE` is the
   second table, 250–600 m against the 600–2400 m the same kinds are *drawn* at.
   **poiBuried 18 -> 14.**

**The gate is still red and I am not claiming otherwise:**

```
poiFloating   13 -> 1    baseline 0    gated
poiBuried     23 -> 14   baseline 6    gated
```

Two honest caveats for whoever finishes it:

- The one remaining float is `keycatrich_ruins`, a landmark, at 0.15 m. I bedded
  the stele's base course 900 mm deeper and the reported figure went **up**, to
  0.75 m. That means the number is not what I assumed it was — read
  `floatcheck.mts`'s compound rule before trusting the sign of it.
- The `poiBuried` baseline of 6 is itself unstable: the method lane measured 25
  at `2437bc0` and 7 a few commits later, across a night in which the terrain
  was reshaped twice. The remaining fourteen are dominated by **no-apron
  landmarks on sharp relief**, where the drawn surface and the seat envelope
  disagree by more than the object is tall. The cheap fix is a small `gradePad`
  under the waymark, and I did not take it because it is +1 to +2 draws on 23
  landmarks and this lane is already over the draw budget.

## Unverified, and why

- **`pnpm run check`** — not run. The daemon spent much of the last two hours
  crash-looping (`uptimeSec` under 15 on every poll; `shoot`, `probe` and
  `floatcheck` all returning `ECONNRESET` or a 300 s `preparePage` timeout, on
  committed shas as well as `--dirty`, including on `hero_full`).
  `cleanup.mts` reported clean throughout. It recovered near the end, which is
  how the nine-shot table and `floatcheck` got taken at all.
- **The five-round capture review the brief asks for.** Four rounds on the pads
  and kits (`tmp/shots/kits-r0b`, `r7`, `r9`, `r11`/`r12`), every frame read.
  One round on `town_forecourt` after the Hammerhead pad change, read. The other
  town shots (`town_night`, `town_approach`, `town_caravan`) were not re-read
  after the pad work.

## Two visual defects the coordinator raised, and what I found

### The garage sign — tested, and the report is not what it looks like

The fix was **tried and reverted**, and the negative is the deliverable.

`tmp/shots/sign/sign.png` reads as "SOPHIAR" in the correct left-to-right order
with every glyph mirrored vertically. Everything that could produce a mirror was
eliminated by construction first:

- `ry = Math.PI` on the plate mirrors **U**, not V. It would give `RAIHPOS`.
- `signMaterial` is `DoubleSide`; seeing the back face gives the same `RAIHPOS`.
- `garageSignTexture` draws the name above the strapline, and the frame shows
  them in that order — so the texture as a whole is not inverted.

So I flipped V on **every** sign plate in the town (deliberately all of them: if
the cause were one call site the others would then be wrong, and one frame tells
you which). Result in `tmp/shots/sign-fix/sign.png`: the *layout* moved — the
strapline is now where the name was and the name is off the top of the plate.
**That eliminates the last rigid transform.** No V flip, no U flip, no face
choice can produce "right order, right vertical placement, mirrored glyphs".

What is left is that the word is **about twelve pixels tall on a fascia seen at
a grazing angle**, and `crop.mts` upscales 6× with no filtering. The defect is
**legibility, not orientation**, and it wants a bigger plate or a shorter word.
The elimination is written into the source at the call sites so the next person
does not repeat it. `signCN`, `signMB`, `signHB`, `signRB` and `signCM` are
placed identically and are the same story.

### The forecourt "bathroom tiles" — not touched, and here is the read

Untouched: I ran out of budget before I could ablate it, and this is exactly the
class where re-tinting first is wrong. What I can say from
`tmp/shots/town-cost2/town_forecourt.jpg`, read at the end of the session: the
hardstanding under the canopy is a regular grid of large pale panels with thin
dark joints and **no value alternation between panels**. That is closer to
poured bays than the "checker" description suggests, so the remaining problem is
probably bay *size* rather than the tile's contrast.

The two candidates need separating before either is edited:

1. `TEXEL`'s `[/^town_slab/, 7.0]` — 7 m bays. A fuel-station bay is 3–4 m, so
   this is plausibly a one-number change.
2. `slabMaterial` (`TownMaterials.ts:120`) — if the tile itself carries the grid
   at too much contrast, no density change fixes it.

**Re-bake at 3.5 m and capture before editing the texture.** And note the trap:
a material's texbake key contains its roughness and metalness, so changing
either invalidates the cache *silently* and boot falls back to runtime
generation — `node src/tools/texbake.mts --force` after any material edit, and
that rewrites the cache every materialised tree symlinks.

**The asphalt half of this is fixed and is visible in the same frame.** The pad
no longer reads as a flat black polygon: it is mottled, it carries the oil and
tyre wear, and its edge dissolves into the dirt instead of stopping on a line.

The corrugated-siding shimmer is `handoff/modeling.md`'s open item 6, now
visible on the flat as well as on the canopy roof. Untouched.

## What is left, in priority order

1. **`floatcheck` green.** `poiFloating 1` and `poiBuried 14` against a ratchet
   of 0 and 6. See the section above for the two leads.
2. **`town_forecourt` under 800.** It is 991. Reconcile the 349-draw ablation
   against the 46-mesh page count first — one of them is wrong and acting on the
   wrong one wastes a round.
3. **§5.2 on Hammerhead**: plinths with buried footings on the diner, garage and
   shop; a coping and drip lip on each; the two window cills down to ~1.05 m.
   `BuildKit.plinth` and `BuildKit.parapet` already do all of it and the town has
   never called either.
4. **Soft goods into the remaining callers**: `Outposts` (camo net over the
   containers, sandbags round the mast), Hammerhead's clutter (an awning over
   the shop front, a tarp over the pallet stack), the caravan.
5. **The slab tiling** — re-bake `town_slab` at 3.5 m and capture before editing
   `slabMaterial`. The sign is *closed*: every rigid transform is eliminated and
   the residue is legibility, written up above.
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
