# Water lane — shorelines and rivers (plan §6.1, §6.2)

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` §6.
Coordinator: `project/handoff/2026-08-23-coordinator.md`.
Owns `src/world/Water.ts` and `src/world/water/**`. Nothing else.

## State

| item | state |
|---|---|
| §6.1 shoreline contour ribbon | **built, wired, gated** — `4d0b4c2`, `5ede140` |
| §6.2 channel-fitted river strip | **built, wired, gated** — `8ff0098` |
| capture review, five rounds | **in progress** — one round read at `tmp/shots/water-r1` |
| tarn regression (below) | **found, not fixed** — this is the next thing to do |

## THE THING SOMEBODY MUST FIX: every inland tarn is dry

**All ten authored fishing spots have no water**, and it is a regression from
§4.2's drainage incision, measured tonight:

```
id                  h     floor    q26    spill   level   why
swainsmere        68.9    53.4    62.7    53.4    53.0    no-hollow
malacchi_pond     20.0    -2.5    13.6    -2.5    -2.8    no-hollow
archaeans_mirror  38.3    30.0    35.3    30.0    29.6    no-hollow
maidenwater       39.2    36.2    39.6    36.2    35.8    no-hollow
rachsia_bridge   126.6   106.7   125.1   106.7   106.4   no-hollow
   (and five more, all the same)
```

`spill == floor` on **every one**. `Water._findTarns` takes the rim as the
minimum height on an annulus at 0.86–1.0 R and refuses to fill a basin whose rim
is at its floor — correctly, because such a basin drains. §4.2 cut a channel
through the rim of all ten. `Water.bodies` today is **four sea basins and no
tarns**, so `poi_fishing` and every inland water shot has open ground where the
map promises a pond. This was true before I touched anything.

The fix I did not have time for, and would do next: replace the annulus minimum
with a **priority flood** — start at the basin floor, expand to the lowest
frontier cell, and the level at which the frontier escapes the disc is the true
sill. That is right where the ring minimum is wrong (a channel *entering* from
above does not drain a pond; only one *leaving* below the pond level does), and
it will bring back the tarns that still have a sill. Any that genuinely drain
through are now river reaches, which is §6.2's job and is correct.

## What landed

### `src/world/water/contour.ts` — marching squares, chaining, re-snap

Traces an iso-contour of a height function, chains the segments into polylines
(saddles resolved by the cell centre, not by convention), resamples at fixed arc
length and then **bisects every sample back onto the line**.

The re-snap is the measured part. Across the world's 23.4 km of coastline it
moves a point a **median of 0.29 m**, up to 5.40 m. A quarter of a metre is a
fifth of the whole swash band, so a ribbon built without it hangs its waterline
row over dry ground. That is the plan's *"smoothing alone walks the line inland"*
and the number is ours.

### `src/world/water/Shore.ts` + `ShoreMaterial.ts` — the ribbon (§6.1)

21 rows, placed by **elevation first-crossing** at +0.60 / −1.45 m, biased toward
the waterline by a signed power curve. First crossings of increasing targets are
monotone by construction, so rows cannot cross each other *at a point*.

They cross *along the shore*, and three clamps stop it. All three are measured
on the bench (`tmp/water/bench2.mts`, a synthetic 7.3 km coast):

| clamp | ablated | kept |
|---|---|---|
| curvature of the **smoothed tangent field** | **throws** (a chain loses >25%) | — |
| Lipschitz 0.65 on `d offset / d station` | 4991 folds | 3817 |
| local thickness (medial axis) | see below | — |

**Local thickness is the one specific to this map.** §4.2's incision cuts inlets
four to ten metres wide into the coast; a row marching fifteen metres inland from
one bank of one of those crosses the far bank and comes out the other side. Local
curvature cannot see it — the banks of a straight creek are straight. Every
traced point of a body goes into a spatial hash and each row is capped at 0.42 of
the distance to the nearest non-adjacent piece of waterline on its own side.

**Splitting "not front-facing" into folded and degenerate changed the reading of
the whole build.** Lumped, it reported 16% folding. Separated: **31 216 quads
have zero area** because a creek collapsed their rows — expected, harmless — and
**782 of 233 000** are genuinely folded. A quad with zero area is not wound
backwards.

Shading is `dst * a + c` (`blendSrc = One`, `blendDst = SrcAlpha`), not an alpha
decal: `a` is the wet-sand albedo drop, `c` is foam plus the grazing sky sheen.
The terrain's own sun, shadow, aerial perspective and grade survive underneath by
construction, and there is no second lighting model to drift out of step with the
first. Run-up is an **elevation**, so the band's width falls out of the beach's
slope and collapses to a wet stripe on a cliff. Three detuned along-shore
wavelengths (43 / 71 / 113 m) under an fbm group envelope, phases quantised to
divide a closed loop exactly so there is no seam.

### `src/world/water/River.ts`, `Waves.ts`, `RiverMaterial.ts` — the strip (§6.2)

Routing walks `Terrain.erosionAt`'s unit steepest descent from the highest
accumulation upland cells. **Steepest descent alone does not work here**, and the
numbers say why: in an incised channel the 4 m gradient points at the *thalweg*,
not downstream, so a step crosses the channel, is turned round, and crosses back.
Over five real sources:

| walker | mean length | mean fall |
|---|---|---|
| pure steepest descent | 3200 m | **21 m** |
| + 65% directional inertia | 928 m | 173 m |
| + half-step thalweg recentring | **1018 m** | **236 m** |

The stall detector is judged over fifteen steps. Over five it fires on the inside
of a meander, which is a bend and not a stall.

Two corrections I got wrong first and measured my way out of:

- The running minimum belongs on the **bed profile**, not on the surface.
  Clamping the surface pins it to every bump the traced line crosses: mean depth
  over the whole system came out **0.34 m**, a wet stain. On a monotone smoothed
  bed it is 0.42 m, with real pools where the bed dips below the profile and real
  riffles where it rises through it.
- Width comes from **discharge**, not from how flat the ground is. Uncapped, a
  reach crossing a pan bisects to the full 32 m search limit both ways and draws
  a **64 m sheet of standing water** where there is a stream. Capped at
  `2.6 + 17 q` m: 5.2 m mean, 38.1 m max.

`Waves.ts` is **one GLSL string injected into both stages**. Eight detuned
wavelengths under a 30 m fbm envelope, in channel coordinates (station, lateral)
rather than world xz so they run downstream through every bend and stay
continuous. `uDispCut` is six times the builder's own station spacing, so only
waves the lattice can carry are displaced; every wave still shades.

Foam is Froude (Manning velocity over wave celerity) × riffle-pool alternation in
station × the wave sum's own Jacobian × a shoaling gate, plus the strip's own
edge. Never a contour at a fixed offset.

## The check that mattered most, and it is not the obvious one

**`assertUpward` cannot catch a reversed strip when the emitter drops face-down
triangles.** A wholly backwards lattice comes out as an *empty buffer*, which
passes every winding check there is. The first build of `River.ts` wound the
water strip and one bank backwards and reported **61 474 folds against 331 kept
triangles**, silently, with a clean assert.

So the **fold rate is the gate**, per mesh, at 3%, and `assertUpward` runs behind
it on the final float32 buffer. Both are needed and neither is enough:

- Running the emit test at float64 and the gate at float32 found **one triangle
  in 197 550** that changed sign between them. A test run at a different
  precision from the data is not a test of the data.
- The shore's `assertCardOrientation` (vector form, `src/world/water/geo.ts`)
  checks the **inland vote** against the geometry at the *widest* quad in the
  chain — not the first, which is as likely as any to be a pinch that carries no
  sign at all. Vote and quad come from different data, so it is a real test.

**Method lane**: `geo.ts` holds two asserts `GeoAssert.ts` does not cover —
`assertCardOrientation` in vector form (a ribbon has no UVs; its parameter axes
are the loops that built the index buffer) and `assertAttributes` for a
**ShaderMaterial** (your `assertAttributeContract` knows the standard-material
flags; a raw GLSL string declares attributes nothing parses). Both are twelve
lines. Lift them.

**§9.4 must-run entries** — I do not own `project/must-run.json`. Please add:

```
Water._buildShore
Water._buildRivers
```

## Cost

Three draw calls added in total, all merged, none casting a shadow: the shoreline
ribbon (1), the river water (1), both river banks (1). Every body in the world
shares the ribbon because a body's water level rides in a vertex attribute rather
than a uniform — that is the only reason a sea at −6.5 m and a tarn at +53 m can
share a mesh.

Draw calls from `manifest.json`, before (`tmp/shots/water-r0`) and after
(`tmp/shots/water-r1`, shore only; **other lanes landed between the two, so these
are not a clean attribution**):

| shot | before | after |
|---|---|---|
| zone_galdin | 574 | 564 |
| zone_vesperpool | 626 | 628 |
| zone_alstor | 584 | 582 |
| zone_cape_caem | 468 | 476 |
| poi_fishing | 559 | 597 |
| zone_three_valleys | 537 | 531 |
| storm | 788 | 786 |

**`storm` is at 786 of a budget of 800.** The plan's "measured range 351–506" is
stale; the range tonight is 468–788. Anyone adding a visible `InstancedMesh` to
the storm shot has no room.

Build cost, in the page: shore ribbon **1515 ms** before the per-point fix, and
the fix took it to about a third of that (`drawnEnvelope` and `groundColorAt`
were being asked once per row for an answer that does not vary across a fifteen
metre beach). Rivers **54 ms**. Both at boot, in `Water.init`.

## Files touched

- `src/world/Water.ts` — `_buildShore`, `_buildRivers`, the shore noise texture,
  and the per-frame uniform drive. Nothing else in the file changed.
- `src/world/water/{contour,Shore,ShoreMaterial,River,RiverMaterial,Waves,geo}.ts` — new.

Benches live in `tmp/water/` (deleting `tmp/` must cost nothing, and it does not:
`bench2.mts` is a synthetic coast, `real2.mts` and `river.mts` build the real
`Field` in bare Node in ~17 s, `trace2.mts` is the routing sweep that produced the
table above).

## Open, and the exact next step

1. **Look at the frames.** `tmp/shots/water-look/` is the probe that poses the
   camera at the three gentlest beaches and four river reaches
   (`tmp/water/look.mts`); it had not completed when this was written because the
   capture daemon was restarting under another lane's edits to `daemon.mts`.
   Five rounds minimum, per the brief. **This is the next thing to do.**
2. The tarn regression above.
3. Only **14 of 5503** shore points have a beach gentler than 4 m of run-out.
   Our coastline is overwhelmingly cliff, so the ribbon mostly reads as a wet
   stripe at the waterline rather than as a beach. That may be correct for Cape
   Caem and wrong for Galdin Quay, which the fiction says is a resort on a
   *beach*. Worth a look before it is worth a fix.
4. The river reaches never reach the sea — they stall in closed basins, because
   the heightfield is not hydrologically conditioned. 5217 m of channel across
   seven reaches, all upland. A priority-flood fill of the pits (the same
   algorithm as the tarn fix) would let them run to the coast.
