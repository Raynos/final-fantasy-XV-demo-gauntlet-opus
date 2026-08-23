# Method lane — the benches everything else is measured with

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` §9.1–9.6 and §13
`proudOf`. Coordinator: `project/handoff/2026-08-23-coordinator.md`.
Owns `src/tools/**` (not `scatterstat.mts`), `src/world/props/Seat.ts`, and the
new `src/util/GeoAssert.ts`.

**Why this lane exists.** §9 opens: *"every scalar metric read clean while zero
correct pixels shipped."* This repo has caught the same disease seven times.
Every check here therefore ships with **calibration on a case whose answer is
already known**, re-measured on every run and printed, and with a line saying
**what it is blind to**. Four of the five new tools caught themselves lying
during construction; those are written up below because they are the deliverable.

---

## READ THIS FIRST IF YOU ARE ANOTHER LANE

### The gate is RED, and it is not your fault — but one of you owns it

`floatcheck` says **13 POI compounds are entirely in the air**, worst 16.21 m.
Every one is a `landmark` or a `tomb`:

```
river_wennath   16.21 m (-3300,-1500)   tomb_rogue      9.13 m (-2514,-3292)
keycatrich_ruins 5.08 m (180,-1330)     taelpar_crag    4.35 m (-2330,-1000)
taelpar_bridge   3.94 m (-2286,-486)    longwythe_peak  2.06 m (900,-1180)
ostium_gorge     1.75 m (3300,430)      nebulawood      1.18 m (-1620,-1240)
thommels_glade   0.45 m (-2060,-180)    saxham          0.30 m (-1620,640)
callateins       0.23 m (-2360,-40)     angelgard       0.15 m (3010,3120)
loch_thriocess   0.08 m (-2560,-60)
```

"Entirely in the air" means the lowest support point of **every mesh** in the
compound is clear of the drawn ground — nothing touches. It was **0** when I
first measured, and it is 13 after the coordinator's §4.3 strike-frame reshape
moved the ridge belts. `Landmarks.ts:175` seats with a `Math.min` over an 8-probe
ring at `CULL = 400`; the reshape moved the ring out from under it.

**I deliberately did not baseline it away.** `poiFloating` is pinned at 0 in
`project/float-baseline.json` and is the one count with no benign reading, so
the gate stays red until the landmarks are re-seated. Whoever owns
`props/Landmarks.ts` — this is yours; I do not own that file.

**Only the two POI counts gate.** The instance counts are printed as an
inventory and gate nothing: they are dominated by stacked rock courses, which
rest on rock rather than on soil and are a float by arithmetic rather than by
defect. Measured, they moved 320 → 321 within a minute on a moving trunk and
320 → 379 when the rocks lane landed corestone stacks. Every one of those would
have been a red gate blaming the wrong lane. Gating them needs **one boolean per
instance saying it is meant to be grounded**, and that lives in the placers.

### `node src/tools/silhouette.mts` — LANDED, wired, passing

Does your family of meshes actually have different *shapes*? Bare Node, ~3 s, no
browser, no daemon, no build ref — **it reads the working tree**, so it sees your
uncommitted edit, unlike every capture tool.

```
node src/tools/silhouette.mts                 # trees + enemies, gate
node src/tools/silhouette.mts --set trees
node src/tools/silhouette.mts --pairs enemy   # every pairwise distance
node src/tools/silhouette.mts --calibrate     # the two anchors alone
```

8 azimuths over 180°, 24 bands over the mesh's **own** height, width / height per
band, RMS minimised over azimuth shift and mirror, in **percent of height**. Pure
scale scores 0. Pure yaw scores 0. Both are free from `Ecology` already, so a
metric that counted them as variety would call the world varied while shipping
one tree.

| anchor | what | today |
|---|---|---|
| known-same | broadleaf#4242 vs itself ×1.73, yawed 37° | **0.573** (true answer 0) |
| known-different | conifer vs savanna — spire vs parasol | **42.989** |
| dynamic range | must be ≥ 10× or the run is VOID | **75.1×** |
| threshold | geometric mean of the two anchors | **4.96** |

```
family                   n  distinct   min-d  mean-d  aspect   fill  crown-empty
enemy                  21     20     1.84   43.31    1.05    48%       1%
tree:broadleaf          3      3     8.97   14.21    0.97    38%       0%
tree:conifer            3      3     9.50   12.01    0.67    46%       0%
tree:dead               3      3    13.56   15.72    1.03    18%       3%
tree:duscae             3      3    16.72   21.32    1.15    39%       0%
tree:savanna            3      3    13.19   18.37    1.25    40%       0%
tree:swamp              3      3    23.18   25.31    1.33    58%       0%
tree:thicket            3      3    13.81   17.39    1.08    57%       0%
```

**Characters lane: `irongiant` and `redgiant` are one silhouette** — 1.84 against
a 0.573 floor. In shipped FFXV they are distinct models. Recorded as debt in
`project/silhouette-baseline.json`; the gate is a ratchet and fails on a **new**
collapse. The next tightest cluster is `anak`/`axeman`/`mt`/`irongiant` at
7.5–10.6, which passes and is not comfortable.

`fill` and `crown-empty` are the **companion crown bench** and the paired half
per §9.3 — the width profile is blind to interior structure, so a card cloud and
a real canopy can share an outline; `fill` separates them (card cloud ~100%, our
canopies 38–58%).

**Adding your family:** `treeSubjects()` / `enemySubjects()` are ten lines each;
a subject is `{ family, name, tris }` and `trisOfGeoms([...])` does the rest.
**Rocks are deliberately not wired in** — the rocks lane was rewriting `Rocks.ts`
and I will not import a file being rebuilt under me. Ask, or add it yourself.

### `node src/tools/geocheck.mts` — LANDED. Water lane, this is your ribbon check

Bare Node, ~3 s. The asserts live in **`src/util/GeoAssert.ts`** so a *generator*
can call them at build time, which is where they belong — the plan's line is
that *"nothing in the pipeline can tell you a triangle was wound backwards"*, and
a throw at build time is the only thing that does.

```ts
import { assertUpward, assertCardOrientation, assertConsistentWinding,
         assertAttributeContract } from '../../util/GeoAssert.ts';

assertUpward(ribbon, 'shore ribbon');          // 0 down-facing, or it throws
assertCardOrientation(card, 'tree impostor');  // transpose- and mirror-sensitive
assertConsistentWinding(hull, 'river hull');   // edge parity on a closed mesh
assertAttributeContract(geo, mat, 'megalith'); // §9.5, the black-megalith bug
```

- **Water lane** — `assertUpward` is exactly what a shore ribbon or river strip
  wants: a strip generator is the construction whose winding nothing downstream
  reports on. One line at the end of the builder. **You have written your own
  `assertUpFacing` in `src/world/water/geo.ts`** — I saw it go past in a build
  error. That is the right instinct and it means we now have two; mine is in
  `src/util/GeoAssert.ts`, recounts on the final index buffer, takes an
  arbitrary `up`, and comes with a control (`geocheck --controls`: a reversed
  quad reads 2, a correct one reads 0). Take whichever you prefer, but please
  make it one of them, and if it is yours then delete mine so `geocheck` gates
  the one that ships.
- **Trees lane** — `assertCardOrientation` on the impostor bake. It is O(1) and
  **transpose-sensitive**, which is the whole point: UV *area* is invariant under
  transpose, so every area-, bounds-, aspect- and texel-density-based check
  passes a card rotated 90°, and that is exactly how the sibling's impostor bug
  survived four rounds.
- **Anyone building a mesh for a textured material** — `assertAttributeContract`.
  A missing `uv` samples one texel of the map as a flat colour, so it looks like
  a material choice; a missing `color` under `vertexColors` reads **black**, not
  white.

Five controls run first, with answers known before the run, and the tool exits
**VOID** rather than PASS if any comes back wrong: correct quad → 0 down-facing;
reversed quad → 2; transposed UV → throws; mirrored UV → throws; sphere /
inside-out sphere → 100% / 0% outward; sphere edge parity 0; sphere with one
triangle flipped → 3.

**Characters lane, a lead rather than a verdict: 15 of 21 species carry
edge-parity imbalance**, 178–778 interior edges each (`magitek_armour` 778,
`titan` 776, `bandersnatch` 538, `arachne` 504, `necromancer` 423…). Edge parity
is exact and its control is verified, but it **cannot attribute**: a mirrored
limb whose index was never flipped (a real bug) and a stack of primitives welding
into a non-manifold junction (not one) look identical from here. You landed
*"every lower eyelid in the game was wound inside out"* the same night, so real
inside-out patches in this bestiary are established. Cheapest way to settle it:
render one species with `side: THREE.BackSide` and look for the patches. It
ratchets, it does not gate.

### `node src/tools/floatcheck.mts` — LANDED. Everyone placing props

`proudOf` over the **final instance matrices**, across the whole POI corpus:
it calls `PoiKits._make` for all 123 sites in one boot rather than waiting for
the one-per-frame streamer, so the corpus really is the corpus.

```
node src/tools/floatcheck.mts
node src/tools/floatcheck.mts --at -328,-3672   # stream and read THERE
node src/tools/floatcheck.mts --worst 40 --json tmp/float.json
```

`src/world/props/Seat.ts` now carries `supportPoints`, `proudOf`, `seatPlane`
and `MAX_SINK`. Call them from a placer if you want the check at build time.

- `float` — the air gap under the object, per support point, against the
  **finest** clipmap ring (the ground drawn when the player stands next to it).
  A corner clear of the ground under *it* is a visible sliver of sky, and on a
  slope the downhill corner is the one that shows.
- `sink` — measured against the ground at the instance's **own seat point**, not
  under each support point. See "measured negatives" below; this one mattered.
- `seatPlane` — the 6-probe least-squares fit §13 asks for. Its `residual` is the
  number a normal test cannot give you: **a knife edge passes a normal test** —
  a ridge under a footprint has a perfectly vertical average normal and fits a
  flat plane. Six probes because three define a plane exactly and can never have
  a residual, and four on a square cancel against a saddle.

**Calibrated against a known-bad confirmed by eye.** The coordinator named
floating boulders at Pallareth Pass and in `zone_longwythe`; `--at` streams the
world there and `proudOf` reports floats at exactly those places. I captured both
framings and looked: `tmp/shots/method-float/float_1km.png` has boulders hovering
over the plain with daylight under them, and `tmp/shots/float-crop/boulders.png`
shows a whole cluster — base course included — clear of the ground with no
contact shadow. That is the judge's round-10 complaint, and it is the first time
an instrument here has agreed with a human about it.

### `node src/tools/hydrocheck.mts` — LANDED, at the coordinator's request

`Terrain.erosionAt`'s contract makes two claims and only one was checked.
`Field._hydrology` throws at build time on the percentile median; the *spatial*
claim — that the hot cells form a network and not a haze — lived only in a
scratchpad probe, and a scratchpad probe is not a gate.

Neighbour-is-also-hot lift, `P(neighbour hot | cell hot) / P(cell hot)`, against
three controls computed by the same code path every run: a **shuffled** null
(same histogram, no structure) at 0.90–1.35, a **checkerboard** at 0.000 (this is
§9.6's positive control — the tool exits VOID if it ever reports structure
there), and synthetic **lines** at 3.25. Measured, with the coordinator's
independent numbers in brackets:

```
accum    p90  3.37x [3.19]   p95  5.06x [4.65]   p99 11.37x [11.13]
deposit  p90  6.23x          p95 10.31x          p99 44.25x
scree    p90  5.45x          p95  8.11x          p99 null~0
wet      p90  7.73x          p95 14.28x          p99 73.57x
```

### §9.4 — the wiring gate, and what I still need from you

*"Built-but-unwired is this pipeline's chronic disease"* — ours too: 5,765 lines
of unwired RPG, and seven systems declared, documented, never executed.
`orphans` proves a module is *reachable*; `reachcheck` + `project/must-run.json`
prove it *ran*.

I added the three placement APIs everything tonight seats against, and they all
execute: `Terrain.seatHeightAt` 26,055×, `Terrain.drawnEnvelope` 24,518×,
`Terrain.erosionAt` 5,788×.

**Every lane landing a generator: add its entry to `project/must-run.json`** —
format `"ClassName.method"`, one per line. If you are not sure what the entry
should be, put the class and method in your handoff and I will add it.

---

## Status against the plan

| item | state |
|---|---|
| §9.2 silhouette bench | **DONE** — gated, ratcheted, calibrated, in `pnpm run check` |
| §13 `proudOf` + floating-instance gate | **DONE** — `Seat.ts` + `floatcheck.mts`, gated, and currently red on a real regression |
| §9.1 orientation and winding asserts | **DONE** — `GeoAssert.ts` + `geocheck.mts`. **Not yet called from any generator**; that is the ask above |
| §9.5 attribute contract | **DONE as a library** (`assertAttributeContract`); the build-time call sites belong to the generators |
| §9.3 paired, gameable-aware gates | **DONE for everything I wrote** — every new check prints what it is blind to. **Not retrofitted** onto the older gates |
| §9.4 wiring gate | three APIs added; the per-lane entries are outstanding |
| §9.6 ablation + positive control | **VERIFIED** — see below |

`pnpm run check` went from 11 gates to 15: `silhouette`, `geocheck`,
`hydrocheck`, `floatcheck`.

### §9.6, checked rather than assumed

- **`--hide` is per-mesh, not per-system.** `daemon.mts:1326` traverses
  `g.scene` and matches a case-insensitive substring of each `Object3D`'s own
  name, so `--hide grass_blade` hides one mesh and `--hide grass` hides the
  family. It hides **after** settling, so the two sides of a diff are the same
  world minus one object rather than two different worlds. And a `--hide` that
  matches nothing is recorded as an **error** (`matched no scene object`), which
  is the "never read a null ablation as innocence" rule already enforced.
- **The checkerboard positive control** now exists where a tiling read actually
  happens, in `hydrocheck`.
- **`grep -ln 'chromium.launch(' src/tools/*.mts`** returns `chromium.mts` and
  `harness.mts`, and the `harness.mts` hit is a **comment** about the history
  ("forty-eight tools used to call `chromium.launch` themselves"). No new tool
  launches a browser; three of the four run in bare Node.

---

## Measured negatives, and the instruments that caught themselves lying

This is the part worth reading. **Four of the five tools reported a wrong answer
on a case whose answer was known, before they reported anything about the game.**
Each was caught by running the calibration, not by reading the output.

1. **The silhouette bench's first floor was 1.84 — the same number as the
   closest real pair in the bestiary.** Aligning only over the 8 cyclic azimuth
   shifts means a mesh yawed *between* bins reads as different from itself. An
   instrument whose floor sits on top of its signal is `imgdiff`'s
   global-noise-floor mistake exactly. Rastering at 32 azimuths and aligning over
   all of them took the floor to 0.573 and the dynamic range from 23× to 75×.
   The reported profile is still the 8 the plan specifies.
2. **`floatcheck`'s calibration ran before the force-build**, so `built` was
   empty and a 2 m lift read −1. It reported VOID, correctly.
3. **A fixed 2 m lift on a POI's first mesh read 0.000 m of float**, because that
   mesh is the graded pad and is metres underground — lifting it 2 m leaves it
   underground. It now measures where the tightest support point is (float at a
   1000 m lift, minus 1000) and lifts by exactly `2 − minGap`, so the expected
   answer is **2.000** and not "more than nothing".
4. **The burial rule flagged 92 of 113 POIs**, because it paired the max sink
   across a compound with the max height across the same compound — and a POI's
   apron is a thin plate *meant* to be metres into the ground. It tests the
   tallest mesh against its own height now.
5. **`proudOf`'s `sink` called 1,085 of 1,314 correctly-placed rocks buried**,
   because it was the deepest penetration of any support point, which on a
   hillside is the object's own width times the slope. Burial is a *placement*
   error and placement is a property of the seat point, so `sink` is measured
   against the drawn ground at the instance's own origin. Float stays
   per-support-point.
6. **`floatcheck` was not deterministic and would have cried wolf forever.** Rock
   and debris tile generation is budgeted in wall-clock **milliseconds** per
   frame, so two runs of `settle(120)` came back 134/1073 and 486/874. It settles
   until the live instance count stops moving now (four rounds) and two
   consecutive runs on a still tree agree exactly.
7. **`hydrocheck`'s first threshold was a VALUE threshold**, and the channels are
   bytes that tie heavily — on the checkerboard control the p90 value *is* the
   high value, `> t` selected nothing, and every control came back NaN. Hot is
   defined by rank now.
8. **`scree` at p99 divided by a null of zero and printed `Infinityx`**, which
   looks like a triumphant pass and is a division by nothing. When the null
   cannot produce a hot neighbour the test becomes an absolute one and says so.
9. **`geocheck`'s flipped-triangle control read 0 where the answer is 3, twice,
   for different reasons.** First the flip was applied to a UV sphere's *pole*
   fan, whose triangles weld to degenerate and are skipped. Then a `back === 0`
   early-out counted the smoking gun as a boundary — a flipped triangle removes
   the reverse traversal at the same moment it duplicates the forward one. Then
   it read **1** instead of 3, because iterating the directed edge map while
   skipping `a > b` looks equivalent to walking unordered edges and is not: such
   an edge is skipped from both sides.
10. **Counting duplicated directed edges flagged 15 of 21 species with up to 778
    edges apiece** — but these meshes are stacks of primitives, and two closed
    shells touching at coincident vertices weld into an edge traversed twice
    *each way*. That is redundant modelling, not a winding error. The test is
    **parity** now (`f !== r`). It still flags 15 of 21, which is why it is
    reported as a lead rather than gated.
11. **The obvious winding check does not work on a creature.** Face normal
    against `(faceCentroid − meshCentroid)` scores 100% on a sphere, **52–62%**
    on the bestiary's limbed species, and chance is 50%. Reported as a weak
    secondary read rather than buried; edge parity is the one that is exact.
    **And I ratcheted it anyway, and it immediately cried wolf**: the moment the
    trees lane landed its habit layer, six tree geometries were "wound further
    inside out" by one to three points, every one a legitimate shape change. A
    weak metric behind a tight ratchet is a gate that fails for the wrong reason,
    which is the precise failure this lane exists to prevent — so the outward
    fraction is now printed and recorded and **not gated at all**. Only the
    exact tests gate: non-finite numbers, out-of-range indices, and edge parity.
12. **The six `any` that turned the trunk red were the identifier `any`**, not
    the type: `let any = false` as a scanline flag. `anycheck` counts a bare
    `any` token anywhere in code, which is right — the alternative is a scanner
    fooled by naming a variable after the thing it bans.

And one thing that is simply useful: **bare Node imports our generators fine.**
`TreeBuilder.ts` in 53 ms, the whole `Bestiary.ts` with 23 species in 213 ms,
type-stripping `.ts` directly, no DOM and no canvas. Three of the four new gates
need no browser at all. Any check over *shape* can and should be a bare-Node
tool.

---

## What is left, and the exact next step

1. **Re-seat the 13 floating landmarks** (not mine — `props/Landmarks.ts`).
   `node src/tools/floatcheck.mts --worst 20` lists them; `--at x,z` reads any
   one of them directly.
2. **Call the asserts from the generators.** `GeoAssert.ts` is a library nothing
   calls yet, which is precisely the "built but unwired" disease §9.4 names. The
   four one-line call sites are listed above.
3. **Retrofit blindness lines** onto `seatcheck`, `creaturecheck`, `edgestat`,
   `imagestats`, `driftcheck`. Cheap, not done.
4. **Wire rocks into `silhouette.mts`** once `Rocks.ts` settles — a ten-line
   subject function, and the sibling anchors (a single corestone 3.90, a stack
   6.1–8.3) are in the same units, so it is directly comparable.
5. **Re-take the float baseline after the night's landings**:
   `node src/tools/floatcheck.mts --set-baseline`, then **restore
   `poiFloating: 0` by hand** — it is pinned deliberately and the tool will
   happily bake a regression into it otherwise.
6. **Gate instance floats at zero** rather than ratcheting them. That needs the
   placers to declare which instances are meant to be grounded: a stacked rock
   course rests on rock, not on soil, and from outside `Rocks.ts` a stack course
   and a floating boulder are the same measurement. One boolean per instance in
   the placement record would close it.

## Files touched

New: `src/tools/{silhouette,floatcheck,geocheck,hydrocheck}.mts`,
`src/util/GeoAssert.ts`,
`project/{silhouette,float,geo}-baseline.json`.
Edited: `src/world/props/Seat.ts` (added `supportPoints`, `proudOf`, `seatPlane`,
`MAX_SINK`), `src/tools/check.mts` (four gate rows), `project/must-run.json`
(three placement APIs).

Shots: `tmp/shots/method-float/float_1km.png` (Pallareth, floating boulders),
`tmp/shots/float-crop/boulders.png` (the coordinator's `zone_longwythe` crop).
