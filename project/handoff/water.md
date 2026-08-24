# Water lane — shorelines and rivers (plan §6.1, §6.2)

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` §6.
Coordinator: `project/handoff/2026-08-23-coordinator.md`.
Owns `src/world/Water.ts` and `src/world/water/**`. Nothing else was touched.

## State

| item | state |
|---|---|
| §6.1 shoreline contour ribbon | **landed, wired, gated, reviewed** — `4d0b4c2` `5ede140` `e23d6cd` `5fc49b3` |
| §6.2 channel-fitted river strip | **landed, wired, gated, reviewed** — `8ff0098` `5fc49b3` `4e9f362` |
| capture review | **three rounds read**, not five. The remaining defects are named below. |
| tarn regression | **found and measured, NOT fixed.** See the next section. |

Both of §6 is built. `docs/SCOPE.md`'s rivers item is no longer outstanding.

---

## 1. Unfixed: every inland tarn is dry, and it is a §4.2 regression

**Confidence: measured, high.** Probed directly through `Water._findTarns`'s own
arithmetic at `HEAD` on 2026-08-24 (`tmp/water/p2.mts`). Not inferred from a frame.

All ten authored fishing spots have no water. The reason is one number:

```
id                    h    floor     q26    spill    level   verdict
swainsmere         68.9    53.4    62.7     53.4     53.0    no-hollow
malacchi_pond      20.0    -2.5    13.6     -2.5     -2.8    no-hollow
archaeans_mirror   38.3    30.0    35.3     30.0     29.6    no-hollow
maidenwater        39.2    36.2    39.6     36.2     35.8    no-hollow
rachsia_bridge    126.6   106.7   125.1    106.7    106.4    no-hollow
  (and five more, identical shape)
```

`spill == floor` on **every one of them**. `_findTarns` takes the rim as the
minimum height on an annulus at 0.86–1.0 R and refuses to fill a basin whose rim
sits at its floor — correctly, because such a basin drains. §4.2's drainage
incision cut a channel through the rim of all ten.

**How to see it**: `node src/tools/probe.mts tmp/water/p2.mts`, or just read
`Water.bodies` — it is four sea basins. (A fifth body, `maidenwater`, appears
intermittently as other lanes move the terrain; the shore build has seen either 4
or 5 bodies on different shas tonight.)

**The fix I did not have time for**: replace the annulus minimum with a
**priority flood** — start at the basin floor, expand to the lowest frontier cell,
and the level at which the frontier escapes the disc is the true sill. That is
right exactly where the ring minimum is wrong: a channel *entering* the disc from
above does not drain a pond, only one *leaving* below the pond level does, and a
ring minimum cannot tell those apart. Any basin that genuinely drains through is
now a river reach, which is §6.2's job and is the correct answer for it.

This also unblocks the rivers reaching the sea — see §5 below.

---

## 2. Two findings that generalise beyond this lane

Coordinator: both of these are candidates for `project/LANDMINES.md`. I have not
edited that file.

### A geometry assert inside `init()` **hangs the boot**, it does not fail

`2522bda`. The method lane's new `src/util/GeoAssert.ts` is built to throw at
build time, and that is right. But a generator called from a system's `init()`
throws into an `await` that never resolves, so **`window.GAME.ready` is never
set**, and what every agent on the machine then sees is:

```
Error: page.waitForFunction: Timeout 300000ms exceeded.
```

with **no message, no stack from the page, and nothing naming the file**. It is
indistinguishable from a slow boot, from a broken vite build, and from the daemon
restarting under another lane's edit — all three of which were also happening
tonight. I lost the better part of an hour to it and briefly suspected three
other lanes.

`shoot.mts --no-daemon` does not surface it either. What found it in the end was
re-running the generator *from inside a probe* on a page that had already booted
(`tmp/water/shorerr.mts`), which is the only way to get the message out.

**The pattern to copy**: catch at the call site, `console.error` the exception,
and carry on. `shoot.mts` exits non-zero on any page error, so nothing can ship
green past one of these — the loudness is preserved — and the world still boots,
so the defect can be photographed instead of only inferred.

```js
try { this._buildShore(game, terrain); } catch (err) { console.error('[Water] shore ribbon:', err); }
```

**Anyone calling a `GeoAssert` from an `init()` path wants this.**

### A gate threshold that only a small case exposes

`e23d6cd`. I set the shore ribbon's "is this chain wound backwards" gate at 3%
of triangles by picking a number. The two populations are nowhere near it, and
both are measured:

- a **reversed** strip folds essentially all of itself. `River.ts`, wound
  backwards, gave **61 474 folds against 331 kept**.
- a **real coastline pinches**: 0.39% of triangles globally — but **4.4% on a
  nineteen-point closed loop**, a pond about thirty metres across, of which this
  map has three.

So 3% passed every large body in the world and failed only on a pond, which is
the worst possible failure profile: it looks like it works. It is 35% now, which
pinching cannot reach and a reversal cannot miss.

**The general form**: when a gate separates two populations, measure *both* and
put the threshold between them. A rate that is right for the big cases and wrong
for the small ones will pass every test you happen to run first.

---

## 3. What landed, and the measurements behind it

### `src/world/water/contour.ts` — marching squares, chaining, re-snap

Traces an iso-contour of a height function, chains segments into polylines
(saddles resolved by the cell centre, not by convention), resamples at fixed arc
length, and **bisects every sample back onto the line**.

The re-snap is the measured part. Across the world's 22.7 km of coastline it
moves a point a **median of 0.315 m**, up to 5.38 m. A third of a metre is a
fifth of the whole swash band, so a ribbon built without it hangs its waterline
row over dry ground. That is the plan's *"smoothing alone walks the line inland"*
and the number is ours.

### `Shore.ts` + `ShoreMaterial.ts` — the ribbon (§6.1)

21 rows placed by **elevation first-crossing** at +0.60 / −1.45 m, biased toward
the waterline. First crossings of increasing targets are monotone by
construction, so rows cannot cross each other *at a point*.

They cross *along* the shore, and three clamps stop it. All ablated on the bench
(`tmp/water/bench2.mts`, a synthetic 7.3 km coast):

| clamp | with | ablated |
|---|---|---|
| curvature of the **smoothed tangent field** | 3817 folds | **throws** — a chain loses >25% |
| Lipschitz 0.65 on `d offset / d station` | 3817 | 4991 |
| local thickness (medial axis) | — | required on the real map, see below |

**Local thickness is the clamp specific to this map.** §4.2's incision cuts
inlets four to ten metres wide into the coast; a row marching fifteen metres
inland from one bank of one crosses the far bank and comes out the other side.
Local curvature cannot see it — the banks of a straight creek are straight. Every
traced point of a body goes into a spatial hash and each row is capped at 0.42 of
the distance to the nearest non-adjacent piece of waterline **on its own side**.

**Splitting "not front-facing" into folded and degenerate changed the reading of
the whole build.** Lumped, it reported 16% folding. Separated: **13 166 quads
have zero area** because a creek collapsed their rows — expected, harmless — and
**656 of 214 000** are genuinely folded. A quad with zero area is not wound
backwards, and counting it as though it were had me chasing a defect that was not
there.

Shading is `dst * a + c` (`blendSrc = One`, `blendDst = SrcAlpha`), not an alpha
decal: `a` is the wet-sand albedo drop, `c` is foam plus the grazing sky sheen.
The terrain's own sun, shadow, aerial perspective and grade survive underneath by
construction, and there is no second lighting model to drift out of step with the
first when somebody edits the terrain shader. Run-up is an **elevation**, so the
band's width falls out of the beach's slope for free and collapses to a wet
stripe on a cliff. Three detuned along-shore wavelengths (43 / 71 / 113 m) under
an fbm group envelope, phases quantised to divide a closed loop exactly so a
closed shoreline has no seam.

### `River.ts`, `Waves.ts`, `RiverMaterial.ts` — the strip (§6.2)

Routing walks `Terrain.erosionAt`'s unit steepest descent from the highest
accumulation upland cells. **Steepest descent alone does not work here**, and the
numbers say why: in an incised channel the 4 m gradient points at the *thalweg*,
not downstream, so a step crosses the channel, is turned round, and crosses back.
Over five real sources (`tmp/water/trace2.mts`):

| walker | mean length | mean fall |
|---|---|---|
| pure steepest descent | 3200 m | **21 m** |
| + 65% directional inertia | 928 m | 173 m |
| + half-step thalweg recentring | **1018 m** | **236 m** |

The stall detector is judged over fifteen steps. Over five it fires on the inside
of a meander, which is a bend and not a stall.

Three corrections I got wrong first and measured my way out of:

- The running minimum belongs on the **bed profile**, not on the surface.
  Clamping the surface pins it to every local bump the traced line crosses; mean
  depth over the whole system came out **0.34 m**, a wet stain. On a monotone
  smoothed bed there are real pools where the bed dips below the profile and real
  riffles where it rises through it.
- Width comes from **discharge**, not from how flat the ground is. Uncapped, a
  reach crossing a pan bisects to the full 32 m search limit both ways and draws
  a **64 m sheet of standing water** where there is a stream.
- **Discharge grows downstream.** The accumulation percentile is already high at
  the source of a traced reach, so with the cap alone every river came out full
  width from its first metre and a headwater looked like an estuary. Width now
  ramps over the first 850 m.

`Waves.ts` is **one GLSL string injected into both stages** — the plan's rule, and
the reason for it is that two drifting sums slide the shading off the geometry and
it reads as a lighting bug. Eight detuned wavelengths under a 30 m fbm envelope,
in channel coordinates `(station, lateral)` rather than world xz so they run
downstream through every bend and stay phase-continuous. `uDispCut` is six times
the builder's own station spacing, so only waves the lattice can carry are
displaced; every wave still shades, because a normal is per pixel and has no
sampling limit.

Foam is Froude (Manning velocity over wave celerity) × riffle-pool alternation in
station × the wave sum's own Jacobian for steepening crests × a shoaling gate,
plus the strip's own edge. Never a contour at a fixed offset.

### The check that mattered most, and it is not the winding assert

**`assertUpward` cannot catch a reversed strip when the emitter drops face-down
triangles.** A wholly backwards lattice comes out as an *empty buffer*, which
passes every winding check there is. The first build of `River.ts` wound the
water strip and one bank backwards and reported 61 474 folds against 331 kept
triangles, silently, with a clean assert.

So the **fold rate is the gate**, per mesh / per chain, and `assertUpward` runs
behind it on the final float32 buffer. Both are needed and neither is enough:

- Running the emit test at float64 and the gate at float32 found **one triangle
  in 197 550** that changed sign between them. A test run at a different
  precision from the data is not a test of the data. The emitter uses
  `Math.fround` now.
- `assertCardOrientation` (vector form, `src/world/water/geo.ts`) checks the
  **inland vote** against the geometry at the *widest* quad in the chain — not
  the first, which is as likely as any to be a pinch that carries no sign at all.
  Vote and quad come from different data, so it is a real test and not a
  restatement.

---

## 4. Cost

Three draw calls added in total, all merged, none casting a shadow: the shoreline
ribbon (1), the river water (1), both river banks (1). Every body in the world
shares the ribbon because a body's water level rides in a **vertex attribute**
rather than a uniform — that is the only reason a sea at −6.5 m and a tarn at
+53 m can share one mesh.

Geometry added: **213 178 triangles** (shore) + **~48 000** (river water + banks),
about 2–3% of a typical frame's total.

From `manifest.json`, `tmp/shots/water-r0` (before, 2026-08-23) against
`tmp/shots/water-r2` (after, both §6 items and three review rounds).
**Other lanes landed continuously between the two, so this is not a clean
attribution** — treat it as "the water did not move the budget".

| shot | draws before | draws after | tris before | tris after |
|---|---|---|---|---|
| zone_galdin | 574 | 576 | 11 541 904 | 8 366 676 |
| zone_vesperpool | 626 | 632 | 17 493 818 | 15 706 087 |
| zone_alstor | 584 | 574 | 19 427 740 | 21 331 327 |
| zone_cape_caem | 468 | 458 | 6 505 413 | 6 568 884 |
| poi_fishing | 559 | 558 | 12 580 755 | 9 088 493 |
| zone_three_valleys | 537 | 532 | 9 073 871 | 9 151 970 |
| **storm** | **788** | **783** | 10 185 037 | 9 048 435 |

**`storm` is at 783 of a budget of 800.** The plan's "measured range 351–506" is
stale; the range on these seven shots tonight is 458–783, and the coordinator
measured `town_forecourt` at 1037. Anyone adding a visible `InstancedMesh` to the
storm shot has no room at all.

Build cost, in the page, at `HEAD`: shore ribbon **327 ms**, rivers **62 ms**,
both at boot inside `Water.init`. The ribbon was 1515 ms before `5ede140` —
`drawnEnvelope` and `groundColorAt` were being asked once per row for an answer
that does not vary across a fifteen-metre beach.

---

## 5. Review rounds, and what is still wrong

Shots read: `tmp/shots/water-r0` (before), `water-r1`, `water-look2`,
`water-look3`, `water-r2`. The corpus shots put every shoreline 250 m or further
from the camera, so the close review is done with `tmp/water/look.mts` — a probe
that poses the camera at the three gentlest beaches and four river reaches and
photographs each. Run it with:

```
node src/tools/probe.mts tmp/water/look.mts --shot tmp/shots/<out>/w.jpg
```

**`zone_galdin` is the before/after the coordinator asked about.** In `water-r0`
the land ends at the sea along a hard analytic cut. In `water-r2` there is a
damp, darker margin along both the near and far shore with foam at the waterline.
At that camera distance (250–400 m) it is a *subtle* improvement rather than a
dramatic one — the honest read is that the hard cut is gone, not that there is
now a beach.

### Fixed during review — all four found by reading frames, with every stat clean

- **The clipmap envelope lift is wrong for a shoreline.** It is the right idea
  for an apron and `Terrain.drawnEnvelope`'s own docstring argues for it, but it
  is a per-ring quantity: it jumped by up to its 0.9 m clamp between one shore
  point and its neighbour and the ribbon came back as a scatter of white plates
  hovering over the beach **with their own shadows underneath**. A shoreline is a
  thin band viewed edge-on; 5 cm and `polygonOffset` is all it can afford.
  **Recorded as a measured negative** — the envelope stays right for aprons.
- **The swash lace covered the whole wet zone** and the shoreline read as snow.
  It is a Gaussian band behind the run-up edge now, and the additive gain went
  0.85 → 0.40 (against a multiplier that floors at 0.52, 0.85 clipped white in a
  linear HDR buffer whatever was underneath).
- **An uncapped Fresnel made the river read as white plastic.** A low camera
  looking along a reach sees almost all of it at a graze, so the whole strip went
  to the sky colour. A river is rough at every scale below a pixel, so its
  grazing reflection is a wide diffuse lobe — and the RMS slope the shared wave
  sum already returns is exactly the right thing to widen it with. Capped at 0.62
  falling to 0.34 as the surface roughens; sky term halved; specular 1.7 → 0.6.
- **Bank spray was gated on elevation alone.** A bank climbing 1.5 m over 13 m is
  inside the elevation window for almost all of its width, and the decal is the
  wider of the two surfaces, so the river came back as a 39 m streak of white
  lace with a 3 m stream somewhere inside it. It needs both low *and* near now.

And one landmine paid for twice tonight: **a backtick inside a `/* glsl */`
template literal terminates the string.** Mine was inside a comment about the bug
I was fixing.

### Still wrong, in priority order

1. **The rivers are too narrow now.** Mean width **3.09 m**, max 12.71, mean
   depth 0.36 m. That is a brook, not a river, and it over-corrects the 64 m
   sheet. The half-width cap `1.5 + 9.5 q` and the depth `0.34 + 1.55 q` are the
   two numbers to raise; I would try `2.5 + 14 q` and re-read `w-river*.jpg`.
   **Unverified either way — I did not get a round on it.**
2. **The near-field foam is still too flat and too white** in `w-shore1.jpg`. It
   is a large uniform patch rather than a lace. The `lace` threshold and the
   `brk` shore-break term are the handles.
3. **Only 514 of 5 677 shore points have a beach gentler than 4 m of run-out.**
   Our coastline is overwhelmingly cliff, so the ribbon mostly reads as a wet
   stripe at the waterline. Correct for Cape Caem; the fiction says Galdin Quay
   is a resort on a *beach*, and it is not one.
4. **A black quad appears in `water-look2/w-river0.jpg`**, top left, in mid-air
   over the plateau. I did not identify it. It is *not* obviously mine — the
   camera in that probe is high above a plateau and it could be a lake surface
   quad seen edge-on — but nobody has ruled it out either. **Unverified.**
5. **The river reaches never get to the sea.** 5217 m of channel across seven
   reaches, all upland: the traces stall in closed basins because the heightfield
   is not hydrologically conditioned. The priority flood in §1 is the same
   algorithm and would fix both.

---

## 6. For other lanes

**Method lane** — `src/world/water/geo.ts` holds two asserts `GeoAssert.ts` does
not cover, and both are twelve lines. Please lift them:

- `assertCardOrientation` in **vector** form. Yours reads a quad's UV basis; a
  ribbon has no UVs at all, its parameter axes are the two loops that built the
  index buffer. Same transpose- and mirror-sensitivity, different input.
- `assertAttributes` for a **ShaderMaterial**. Your `assertAttributeContract`
  knows `map`/`normalMap`/`vertexColors` — the standard-material contract. A raw
  GLSL string declares attributes that nothing parses, and an undeclared
  attribute still reads as zero silently: for this ribbon, zero means "exactly at
  the waterline everywhere", which is a wet band over the entire surface and
  looks like a shader bug rather than a missing buffer.

Also please see §2's first finding — it is about how your asserts fail when they
are called from an `init()` path, and your users need it.

**§9.4 must-run entries** — I do not own `project/must-run.json`. Please add:

```
Water._buildShore
Water._buildRivers
```

**Terrain / coordinator** — the tarn regression in §1 is a change to
`Water._findTarns`, which is my file, so I am not asking for a terrain change. I
simply ran out of night. It is the highest-value single fix left in this lane:
ten authored POIs currently promise water and deliver dry ground.

---

## Files

- `src/world/Water.ts` — `_buildShore`, `_buildRivers`, the shore noise texture,
  the per-frame uniform drive, and the two `try/catch` guards. Nothing else in
  the file changed; the reflection layer fix and the tarn scan are as I found them.
- `src/world/water/{contour,Shore,ShoreMaterial,River,RiverMaterial,Waves,geo}.ts` — new.

Benches live in `tmp/water/` and deleting `tmp/` costs nothing:

| file | what |
|---|---|
| `bench2.mts` | synthetic 7.3 km coast, bare Node, ~0.1 s — the clamp ablations |
| `real2.mts` | the **real** `Field` in bare Node (~17 s to build) → shore ribbon |
| `river.mts` | same, → rivers |
| `trace2.mts` | the routing sweep that produced the inertia/recentring table |
| `look.mts` | in-page probe: poses the camera at beaches and reaches, photographs each |
| `p2.mts` | the tarn spill probe in §1 |
| `shorerr.mts` | re-runs the shore build **inside a booted page** — the only way to get an `init()` throw's message out |

The bare-Node benches build the generator field rather than the bake, and I
checked that matters: the river build reports byte-identical statistics either
way (5217 m, 34 605 water triangles), so the two agree.
