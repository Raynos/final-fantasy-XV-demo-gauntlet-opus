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
