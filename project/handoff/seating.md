# Seating lane — what `floatcheck` measures, and the one red gate

Owns `src/world/props/{Seat,PoiKits,Landmarks,Outposts,Megastructures,RoadFurniture}.ts`,
`src/world/town/**`, `src/tools/floatcheck.mts`. Picks up from
`project/handoff/town.md`, which took `poiFloating` 13 -> 1 and `poiBuried`
23 -> 14 and then ran out of night. Read that first; this does not repeat it.

State on arrival, at `a2a7dbe`:

```
poiFloating    1    baseline 0    gated
poiBuried     15    baseline 6    gated
```

---

## 1. What the metric actually measures — the first task, answered

The town lane left a warning that has to be resolved before any geometry moves:

> The one remaining float is `keycatrich_ruins`, a landmark, at 0.15 m. I bedded
> the stele's base course 900 mm deeper and **the reported figure went up**, to
> 0.75 m.

**It is not a bug and the sign did not invert. `poiFloating`'s per-POI number is
a minimum over MESHES of a quantity that is already clamped at zero.**

`floatcheck.mts` computes, for each POI compound:

```
compoundFloat = min over meshes of  max(0, min over that mesh's support points of (pointY - drawnGround))
```

Read that literally and two things follow that the town lane's mental model did
not have:

1. **It is not the stele's clearance. It is the clearance of whichever mesh in
   the compound currently comes closest to the ground.** A landmark is four
   merged meshes — `stone` (stele, base course, scattered boulders), `dark`
   (cairn, bench legs), `plank` (bench slats), `runeface` (the carved plane).
   Measured at HEAD on today's terrain, at `keycatrich_ruins`:

   | mesh | float |
   |---|---:|
   | `dark` | **0.99 m** ← the compound's number |
   | `stone` | 1.13 m |
   | `plank` | 1.49 m |
   | `runeface` | 4.15 m |

   The stele is *not* the mesh being reported. Lowering it only lowers the
   compound number while it is still the minimum; the moment it drops past the
   next mesh, **the reported figure jumps to that next mesh and appears to have
   gone up under an intervention that pushed geometry down.** 0.15 -> 0.75 is
   the `stone` mesh being lowered out of first place and the `dark` mesh's 0.75
   becoming the compound's answer. The town lane's own numbers are internally
   consistent with the rule; only the assumption that "the number" belonged to
   the stele was wrong.

2. **Because of the outer `max(0, …)`, the compound reads zero as soon as *any
   one* mesh reaches the ground.** So the gate is not "is the stele seated"; it
   is "does *anything* in this compound touch the earth". That is deliberate and
   the docstring says so — a POI is merged per material and has no per-piece
   matrices left to test, so the only false-positive-free claim is about the
   compound.

Reproduced deterministically rather than argued (`tmp/probes/keycatrich.mts`,
run at HEAD): lowering only the `stone` mesh by 0.9 m takes the compound from
0.991 to 0.234 — **down**, because on today's terrain `stone` starts 0.14 m
above `dark` and stays the minimum for the first 0.14 m of the move only. Push
it 2.0 m and the compound reads 0. Lower **all** meshes by 0.9 m and it reads
0.091. Every one of those is the compound rule behaving exactly as written.

**Consequence for anyone fixing a float: moving one piece is not a fix.** The
compound floats only when *every* mesh floats, so it is fixed by seating the
whole compound, or by bedding one piece far enough to reach ground — not by
nudging whichever piece the report happened to name.

### The second half: the burial number is measuring the graded pad

`poiBuried` is the count of POIs whose **tallest mesh** is more than `MAX_SINK`
(55%) of its own height below the drawn ground at the seat point. The tool's
docstring is explicit that this replaced a first version that "flagged 92 of 113
POIs — because a POI's graded apron is a thin plate that is MEANT to be metres
into the ground".

**The replacement has the same defect, because `gradePad`'s apron is no longer a
thin plate — it is the tallest mesh in the compound.** `Wear.ts:367` lets the
earthwork's toe plunge `max(6, r/2)` metres below the deck, so for a 34 m
imperial pad the apron mesh has a 22 m vertical extent and its lowest support
points are 17 m under grade *by design*. Measured per mesh at HEAD:

| POI | mesh judged | its height | its sink | the structure's own sink |
|---|---|---:|---:|---:|
| `formouth` | `gravel` (**the pad**) | 22.23 | 17.59 | 0.00–0.59 |
| `fort_vaullerey` | `gravel` (**the pad**) | 19.24 | 16.69 | 0.00 |
| `taelpar_rest` | `gravel` (**the pad**) | 14.22 | 9.29 | 0.00 |
| `crestholm_inlet` | `gravel` (**the pad**) | 7.89 | 10.57 | 3.07–3.82 |
| `nebula_parking` | `gravel` (**the pad**) | 7.61 | 7.51 | 0.54–1.80 |
| `cauthess_haven` | `ground` (**the pad**) | 9.94 | 6.14 | 0.00–3.02 |

**Twelve of the fifteen "buried" POIs are the graded pad being read as the
building.** `formouth`'s walls are 0.0–0.6 m into the ground; the tool says the
compound is 17.59 m under. That is not a marginal call, it is the wrong mesh.

The other three are real: `longwythe_peak` (18.81 m), `disc_cauthess` (10.81 m)
and `rock_ravatogh` (9.83 m) are **no-apron waymarks**, and there the number is
honest — the whole compound is under the hill.

### So: is the instrument trustworthy?

- **Gate 1 (`poiFloating`) is sound and its calibration is real** — it lifts a
  real mesh clear of its own sink by exactly 2 m and reads 2.000, and drops it
  exactly onto the ground and reads 0.000. The failure was in reading the
  output, not in producing it. It needed the compound rule written down, which
  is now done above and in the tool.
- **Gate 2's burial half is an instrument measuring the thing it documents as
  intentionally underground.** It is fixed below, and the fix ships with a
  known-answer calibration of its own so that it cannot be the next one.

---

*(sections 2 onward are appended as the work lands)*

## 2. The gate, and where it stands

```
                    on arrival     now      gated
poiFloating              1          0        yes
poiBuried               15          0        yes    (rule changed — see below)
instFloating           362        362        no, inventory
instBuried             861        861        no, inventory
```

`node src/tools/floatcheck.mts` **PASSES** at `c3ee9e9`, with the calibration
green on all three known-answer cases.

`project/float-baseline.json` is re-set at 0 / 0. **That is a target, not a
ratchet, and the note in the file says so**: a compound with nothing touching
the earth, and a deck under the ground it is cut into, are defects with no
legitimate reading. The two instance counts stay ungated for the reason the tool
already documented — they are the streamed set around spawn and they moved
320 -> 379 the night the corestone stacks landed.

**A `poiBuried` recorded before 2026-08-24 is not comparable with one after
it.** The old baseline of 6 was never a number to return to: the method lane had
already measured it at 25 and then 7 within one night, and it was counting the
graded aprons anyway.

### What was actually wrong, in order of how much it cost

| # | defect | where | evidence |
|---|---|---|---|
| 1 | burial rule read the graded apron | `floatcheck.mts` | 12 of 15; `formouth` "17.59 m under" is its pad, its walls are 0.00–0.59 |
| 2 | no-apron waymarks seated by `_base`'s padded recipe | `PoiKits._base` | `keycatrich_ruins` +2.92 m over grade; `longwythe_peak` −18.81 m under it |
| 3 | deck allowed under the drawn ground at the named point | `PoiKits._base` | `crestholm_inlet` −3.82 m with a 2.7 m compound |
| 4 | pad batter hanging in the air over a cliff | `Wear.gradePad` | `nebula_parking`: ground level to 12.6 m, then −10 to −21 m in six |

### Commits

```
a835541  Seat the waymarks on the ground they stand on, not on a deck they have no pad for
4f7daa9  floatcheck: judge burial on the deck, not on the graded pad
3c4fd29  A deck may not sit under the hill it is cut into
e105e26  Re-baseline the seating gate at zero, and say why it is not a ratchet
7dcb128  The pad's batter measures the hill it has to cross, not the point it starts at
c3ee9e9  A platform on a cliff shelf ends at the shelf
```

## 3. The two frames the coordinator sent back

Both were **misattributed to havens, and neither is one.** Identified by
ablation plus projection rather than by looking: `--hide poi_haven` and `--hide
poi_fishing` each left the object standing, and projecting every POI within
700 m through the `zone_nebulawood` camera put `nebula_parking` on its pixels.

- **`reframe-r1/neb_a_high.png`, "a tan mushroom cap on a stalk"** —
  `nebula_parking`, and the cap is its deck sitting correctly on a shelf whose
  ground is level out to 12.6 m and 10–21 m down six metres later. The brim was
  the batter's `-plunge` clamp parking it 6.5 m below the deck in mid air; the
  stalk is the shelf. Fixed by `c3ee9e9`: a bearing whose 1:3 line never reaches
  the ground gets a kerb and the cliff holds the platform up. **Before/after:
  `tmp/shots/seat-r5/zone_nebulawood.jpg` -> `tmp/shots/seat-r8/`.** The
  mushroom is gone and it now reads as a lay-by cut into the hillside.
- **`reframe-r2/hav_d.png`, "a scalloped polygonal skirt"** — that one *is*
  `poi_haven`. `seg` floored at 20 gave a 12.6 m pad a 3.9 m facet on its rim,
  so a wobbled outline was a polygon. Floored at 36 / capped at 64, sized on
  chord error. **Before/after: `tmp/shots/seat-r4/poi_haven.jpg` ->
  `tmp/shots/seat-r8/poi_haven.jpg`.** The facets are gone and the outline
  wanders. **It is a partial fix and I am not claiming otherwise**: the pad
  still reads as a large smooth cone with no surface incident on it, and that
  is a material/wear question rather than a seating one. Draws went **658 ->
  638** across the change, so it was free.

### The envelope question the coordinator raised, answered

*"Worth checking whether the pad and the kit are seated against different
envelopes."* **They are** — `_base` uses `seatY` (lower envelope), `gradePad`
uses `coverY` (upper) — and it is **not** the cause of either frame. Measured
at three havens, `coverY - drawnFine` around the pad is **mean 0.22 m, max
0.87 m** at `longwythe_haven` and mean 0.58 / max 2.23 at `cauthess_haven`. Real
but an order of magnitude too small to make a 6.5 m brim. Recording it as a
measured negative so nobody spends the round I nearly did on it.

## 4. Cost

Draws, `--jpeg`, at `c3ee9e9` against the same shots at `5f7a583`:

| shot | before | after |
|---|---:|---:|
| `poi_haven` | 658 | **638** |
| `zone_nebulawood` | 703 | 723 |
| `poi_reststop` | 990 | 990 |
| `town_forecourt` | 993 | 993 |
| `landmark_insomnia` | 400 | — |

Nothing this lane did adds a material or a mesh: `seg` and the kerb are vertices
in an already-merged geometry, and the waymark's pieces were already there. The
`zone_nebulawood` +20 is other lanes' commits in the same range, not
attributable here — six lanes are committing to this trunk and the town lane
measured a ±450 swing between neighbouring shas.

**The town lane's `gradePad`-under-each-waymark proposal was not needed and is
withdrawn.** It costed +1 to +2 draws on 23 landmarks to fix a float that turned
out to be a seating recipe applied to a kit it was never written for. Seating
them on the finest ring costs nothing and fixes the burials as well.

### The 7.6x ablation disagreement, reconciled — and the ablation is the liar

`handoff/town.md` recorded `--hide poi_kits` costing **349 draws and 3.95 M
triangles** at `town_forecourt`, against an in-page count of the same frame
showing **46 meshes and 0 shadow casters**, and said plainly that one of the two
was not measuring what its name said. It is the ablation.

Everything below is at one pinned build, `sha:b3122ae5afa5`, `--raw` on every
half, taken back to back:

| frame | calls | triangles |
|---|---:|---:|
| control | 1434 / 1414 / 1414 | 16.32 / 16.30 / 16.30 M |
| `--hide poi_kits` | 1085 / 1085 | 11.795 M |
| `--hide poi_` | 1085 / 1085 | 11.795 M |
| `--hide grass` | 971 | 11.540 M |
| **`--hide poi_landmark_fossil_wood`** | **1113** | **11.802 M** |

The last row is the control that settles it. `poi_landmark_fossil_wood` is **one
waymark: 4 meshes, 1,334 triangles, no shadow casters** — counted in the page,
after `applyShot('town_forecourt')`, in `tmp/probes/abl.mts`. Hiding it removes
**301 draws and 4.50 M triangles**. That is arithmetically impossible as an
effect of the object, and it is within 12 draws of what hiding the entire POI
system removes.

**So an `--hide` frame renders with materially less streamed content than its
control — about 320 draws and 4.5 M triangles of it — and that offset is present
whatever you hide.** Any `--hide` delta taken against a plain control in this
repo has that offset in it and is not a cost.

The in-page count is the one that was right. At this shot `poi_kits` holds 8
built groups, **4 visible, 30 visible meshes, 0 shadow casters, 8,240
triangles**. (46 was the town lane's count of 7 groups at a different moment.)

**And the ablation is still usable if you difference it against another
ablation rather than against the control**, because the offset cancels:

```
--hide poi_kits            1085 calls   11.7953 M
--hide poi_landmark_...    1113 calls   11.8017 M
                          ------------------------
the other 26 POI meshes      28 calls        6.4 k triangles
```

28 draws and 6.4 k triangles for everything in `poi_kits` except one waymark —
against an in-page truth of 30 meshes and 8.2 k triangles minus that waymark's 4
and 1.3 k, which is **26 meshes and 6.9 k**. The two instruments agree to within
two draws once the offset is cancelled.

**The POI kits cost about thirty draws in this frame, not 349.** `town_forecourt`
is 993–1434 for other reasons, and nothing in this lane's remit is where its
budget is going.

This is `src/tools/shoot.mts` / `harness.mts`, which this lane does not own —
reported, not fixed. It is the eighth instrument here to be caught measuring
something other than its name.

## 5. `pnpm run check`

**Every one of the 16 passes, and no gate failed twice — but no single run of
the suite was clean, and saying "16/16" without that sentence would be a lie.**

| run | result | failed |
|---|---|---|
| first | 15/16 | `combatloop` — `Target page, context or browser has been closed` |
| second | 14/16 | `reachcheck`, `heightcheck` — both `Node.js v24.18.1` crash tails |

`combatloop` passed **31/31** in the second run and again on its own.
`reachcheck` and `heightcheck` both pass on their own on the same commit
(`reachcheck: every must-run path executed`; `heightcheck` `d 0.000` on every
row). `daemon --health` showed `uptimeSec` 290 during the first run — the daemon
had restarted mid-suite. This is the LANDMINES daemon signature, three times,
under six lanes sharing one machine; it is not a regression and the union of the
two runs plus the re-runs covers all sixteen.

Everything that could plausibly have been broken by this lane passed in both
runs: `geocheck` (which checks seating), `driftcheck`, `floatcheck`,
`roadcheck`, `silhouette`, `orphans`.

## 6. What is left, in priority order

1. **Fix `--hide` in `shoot.mts`.** §4 shows an ablation frame rendering with
   ~320 draws and 4.5 M triangles less streamed content than its control,
   whatever is hidden — measured by hiding one 4-mesh, 1,334-triangle waymark
   and watching 301 draws leave the frame. Until it is fixed, **an `--hide`
   delta against a plain control is not a cost**, and the workaround is to
   difference two ablations against each other so the offset cancels. Not this
   lane's file.
2. **The haven pad still reads as a large smooth cone.** The facets are gone but
   there is no surface incident on 30 m of batter — no scree, no rills, no tonal
   break between fill and undisturbed ground. That is `Wear`'s vertex-colour
   story and a material question, not a seating one.
3. **`the_weaverwilds`, `longwythe_peak` and `disc_cauthess` sit on knife
   edges.** `seatPlane().residual` reports 1.53 m at `disc_cauthess` against a
   9 m footprint. The waymarks are now *on* the ground there, but a bench and a
   cairn on a ridge crest is a siting problem: it wants the POI moved a few
   metres off the crest, which is `WorldMap.ts` and not this lane's file.
4. **The waymark bench reads as a hollow frame at 30 m**
   (`tmp/shots/seat-r1/poi_keycatrich_ruins.png`) — two legs and three thin
   slats with daylight through them. Now that each leg finds its own ground it
   racks correctly, but it wants a stretcher or a solid apron rail.
5. **`_fishing` is the other `noApron` kit and was deliberately left alone.** Its
   deck is set from the sea (`max(1.4, seaLevel + 1.5 - base)`) and its piles run
   3.4 m below that, so it seats itself; if a jetty ever reads wrong, that is the
   place to look and `seatsBare()` in `PoiKits.ts` is where to add it.

## 7. Requests to other lanes

- **terrain (coordinator).** `longwythe_peak` loses **21.2 m** between
  `heightAt` (444.24) and what the clipmap's 6 m ring draws (423.02); the 1.5 m
  ring draws 440.49. That is the region's signature summit changing height by
  twenty metres as you back away from it, and **no prop seating can be right on
  both sides of it** — this lane had to choose, and chose the near read, so a
  4.6 m stele will hang over the sagged summit from ~400 m. It is a
  terrain-LOD defect (a peak sharper than the lattice can carry), not a props
  one. `disc_cauthess` loses 8.0 m and `rock_ravatogh` 10.9 m the same way.
- **scatter / trees.** The town lane's three-line `poiClear` request in
  `handoff/town.md` §"Grass grows through" is still unactioned as far as I can
  see, and it is still the largest visual defect at every POI.
- **coordinator.** `dresscam` came back twice with the **main menu open over the
  frame** (`tmp/shots/seat-r2`, `seat-r3`) on a pooled page, after a clean run of
  the same command minutes earlier. `reset()` is checked by `checkResetDrift`
  against a `party_walk` pose; whatever leaves the menu up is not covered by it.
  Not chased — flagging it because a frame with a menu over it is a wasted
  capture and it is not obvious it is the harness rather than the shot.
