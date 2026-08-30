# Lane 7 — Water and weather

Plan: `docs/plans/2026-08-30-fable-to-nine.md` items 23–26.
Owns `src/world/Water.ts`, `src/world/water/**`, `src/world/weather/**`, and
`src/world/props/Wear.ts` (task 26 only).

## READ THIS FIRST — the whole corpus was black, and it was not water

**`9adfded`** — `src/engine/postfx/GradePass.ts`. `ff8f459` (lane 15, "Grain:
attenuate it on sky") added a `viewDepth(..., uNear, uFar)` call to the grade
fragment shader without adding `uNear`/`uFar` to its GLSL uniform declaration.
GradePass is the last pass, so its program never linking means **nothing reaches
the canvas**: `shoot.mts zone_galdin zone_vesperpool storm poi_haven` at
`884dbb43` returned four *identical* 9308-byte JPEGs, uniformly black, and
`zone_galdin.jpg` was read and confirmed black by eye. **Verified.** Fixed by
adding the declaration; nothing else in that pass touched.

Two lessons already in LANDMINES and both re-earned tonight:
- the failure is invisible to build, both typechecks and every warm capture;
- writing the fix's own comment with backticks inside a `/* glsl */` template
  literal broke the file's *parse* on the first attempt (caught by
  `npx tsc --noEmit` before any save reached a co-agent's capture).

**Anyone comparing frames taken between `ff8f459` and `9adfded` is comparing
two black images.** Any lane that took a "before" in that window must retake it.

## Status

| task | state |
|---|---|
| 23 sea is one slab | four passes landed, each one read off a frame; last capture pending |
| 24 rain density/splashes | streaks **landed and verified by eye**; splashes landed, frame pending |
| 25 probe framings for unjudged water | **landed and looked at** — three findings, all fixed |
| 26 `gradePad` V-from-height | landed `c6f05b1`, **verified by eye** |

## Task 26 — `gradePad` arc-length UV

`Wear.ts` wrote `uv.push(ct * s, st * s)` — a **plan projection** of a surface
that includes a vertical retaining wall. The `cliff` branch walks
`reachOut = 1.6` m out while `y` dives to `-min(26, deepest+1.2)`: **16.25 m of
wall per metre of UV**, so `PropMaterials`' wear tile is smeared into vertical
streaks down exactly the curtain the LANDMINES `gradePad`-at-a-brink entry is
about.

Fixed by building the UV radius from the cumulative **3-D arc length** along the
bearing (`arc += hypot(ds, dy)`) instead of the horizontal run.

The deliberate deviation from the brief: the brief proposed `(along-bearing
metres, arc)`. The metrically exact form of that is `(s * theta, arc)`, and it
puts a **hard tile seam down one bearing of every deck in the game** — a
regression on the flat pads that are the majority — to fix a face most pads do
not have. Keeping the planar form `(ct * arc, st * arc)` instead:
- deck UVs are **bit-identical** to before (`y === 0` there, so `arc === s`);
- a 1:3 batter moves 5%;
- the fall line of a steep face goes to **1:1**, which is the axis the smear
  was on;
- the circumferential axis is over-sampled by `arc / s` — **2.7:1** at a haven's
  26 m wall, because the 13 m deck radius dominates both terms.

Worst-case anisotropy **16.25:1 → 2.7:1**, and finer-than-true reads as grain
where stretched-past-true reads as a smear. Arithmetic **verified**; the frame
is **not yet verified**.

`PropMaterials.ts` quotes that exact line to document the world-metre-UV
contract, so its docstring is updated in the same commit.

## Files touched
- `src/engine/postfx/GradePass.ts` — cross-lane one-liner, `9adfded`
- `src/world/props/Wear.ts`, `src/world/props/PropMaterials.ts`

## Next step
Cold-capture `poi_haven` and look at the wall; then the sea and rain shaders.

## Task 23 — what the baseline frames actually showed (verified by eye)

`tmp/shots/l7/base/*.jpg`, cold, at `9adfded`:

- **`zone_galdin`**: blue corduroy of one amplitude and one scale from the
  swash to the horizon. The pale sandy shallow band exists and is pretty; the
  transition to deep navy is abrupt and then completely uniform for a kilometre.
  No glitter path at 17.8 h. Foam margin present on the right, nearly absent on
  the left.
- **`zone_vesperpool`**: a lake under nine hundred metres of cliff, reading as
  uniform grey-white sandpaper, **with no cliff anywhere in the water** — and
  the terrain clipmap IS on `REFLECT_LAYER`. The reflection was being fetched
  and then destroyed by the normal it was distorted with.
- **`storm`**: evenly spaced identical parallel streaks over the whole frame,
  same length, same brightness, same angle. **Not one splash ring anywhere.**
- **`poi_haven`**: the pad reads as a dark polygonal stamp with a smooth
  untextured skirt spilling down-left — the smear the arc-length UV is for.

## Task 23 first pass — `498127e`, and what it did and did not fix

Cold-captured to `tmp/shots/l7/w1/` and read. **Verified better, not done:**

- `zone_galdin`: the horizon band is now smooth and graded and reads as water
  receding rather than as texture; density variation is visible across the
  mid-field. But the mid-field is still fairly uniform corduroy, and the new
  shoal chop in the shallows reads **blotchy** — a coarse camouflage mottle
  rather than the shore-parallel lines the refraction term was supposed to
  draw.
- `zone_vesperpool`: the far water (300 m+) now takes the pale sky/cliff tone
  smoothly instead of white crinkle, and there is a clear near-to-far gradient.
  The near-mid band (roughly 100–300 m) is **still fine white sandpaper**:
  `calmFar`'s onset, `smoothstep(90, 1100, dist)`, is far too far out.

**Next, and this is the exact next step:** pull `calmFar` in to roughly
`smoothstep(45, 620, dist)`, and cut the shoal chop weights back (`chopA`'s
`1 + 0.55*shoal`, `chopB`'s `1 + 0.80*shoal`) — the mottle is those two, not
the refracted train. Then cold-capture and read again.

## For lane 23 (swimming and diving) — the shader at and below the waterline

Everything here is **read from the source, not yet seen from underneath**;
treat it as a lead, per LANDMINES.

- The surface is `side: THREE.DoubleSide`, `depthWrite: false`,
  `renderOrder = 5`, so it draws from below and does not occlude. Nothing in
  the fragment branches on which face you are on, so **from underneath you get
  the top-side shading**: the sky reflection, the sun glint and the foam band
  are all computed identically and will read as an opaque bright ceiling rather
  than as a bright underside with a Snell window.
- The depth model measures **downward from `uLevel` to the bed**, never from
  the camera. `dropDown`/`path` are unchanged when the eye goes under, so the
  colour of the surface seen from below is the colour of the water column
  *below* it, which is the wrong column entirely.
- `alpha` has a floor of `0.30 * smoothstep(0.04, 0.85, dropDown)` and takes
  `max(..., fres * 0.92)`, so from underneath at a grazing angle the surface is
  ~92% opaque. There is no total-internal-reflection term.
- `Water._visible` is a **bbox test on a slab from `level - 2` to `level + 40`**
  (`_makeSurface`), so a camera more than 2 m under the surface leaves the
  body's own bounds — check whether the surface culls out from below before
  assuming a shading bug.
- `_nearestLevel` picks **one mirror plane per frame for every body**, and
  `reflectCam.layers.set(REFLECT_LAYER)` must stay `set` (a `.enable` there is a
  full second scene render).
- The new `calmFar` term flattens the normal with camera distance, which from
  underneath means the surface a swimmer looks up at is the *near* end of that
  ramp and stays fully perturbed. That is probably right, but it has not been
  looked at.

## Task 25 — the framings, and the three defects they found

**How to shoot them (this matters, and cost an hour):** a probe that poses the
rig with `rig.setShot` and then calls `window.__shot` returns a **black frame**
on this daemon — four of them, verified, `tmp/shots/l7/p1/`. `framecam.mts`
comes back with a picture, because it injects the spec into `SHOTS`, calls
`applyShot` twice around a `settle` and screenshots after that: the corpus
capture path. So the derivation lives in a `framecam --probe` file that returns
`{ specs: [...] }` and framecam shoots them in the same boot.

- `src/tools/probes/l7frames.mts` — **the deliverable for lane 21.** Derives a
  bank pose for every body in `Water.bodies` (waterline walk, wading eye
  height) and one for each of the three biggest confluences in `riverJoins`,
  standing back by 3.2 channel widths so a brook and a trunk frame the same
  size. Uses framecam's `camAt`/`aimAt` terrain-relative form, so no world
  coordinate is written down anywhere. Run:
  `node src/tools/framecam.mts --probe src/tools/probes/l7frames.mts --out tmp/shots/l7/f3 --jpeg`
- `src/tools/probes/l7water.mts` — the earlier `probe.mts` version. Keep it for
  the `Water.bodies` dump (name, extent, level, foamBand, derived `waveScale`);
  its `__shot` frames are the black ones.
- `tmp/l7/frames.json` — five hand-checked framings for `framecam`:
  `storm_zoom`, `storm_ground`, `surf`, `maidenwater`, `vesper_low`. These are
  the four **lane 21 should author into the corpus**: the game has no shot of a
  tarn, a river, a shoreline at eye height, or rain on the ground.

**What the never-before-taken frames showed, and it was worth taking them:**

1. `maidenwater.jpg` — a regular green **crosshatch** over the whole pond, and
   `vesper_low.jpg` evenly spaced diagonal **corduroy**. Both were my own
   `498127e`: scaling all three octaves by `1/waveScale` triples every
   frequency on a small body, and the finest map then tiles every 6.7 m across
   300 m of water — forty-five visible repeats. Fixed in `e082127`: fetch
   scales the **swell** and the set envelope only. Wind chop on a pond and on
   the open sea is the same size, because the same wind makes it. **Verified
   by eye** — the crosshatch is gone and the far treeline now reflects.
2. `vesper_low.jpg` — nine hundred metres of cliff, on `REFLECT_LAYER`,
   rendered into a live target, fetched — and **not in the lake**. The
   reflection was never culled, it was shredded: `sUv += N.xz * 0.045` is 72 px
   of a 1600 px frame applied to a normal carrying 45 deg of per-pixel slope.
   Now `0.004 + 0.030 * calmFar` (`e082127`). **Verified by eye**: the far half
   of the pool now carries a coherent pale sheen and the tarn reflects trees.
3. `maidenwater.jpg` — a **hard straight diagonal cut across the sand**. The
   water plane ends at the basin bbox + 8 m, and the `fres * 0.92` alpha floor
   is taken *outside* the depth model, so every body in the world had a
   92%-opaque sheet of sheen lying over its own beach at grazing angles. Fixed
   in `9f5dd37` (`alpha *= smoothstep(0, 0.06, dropDown)`). **Not yet verified
   by eye** — this is the next frame to read.

**River half of task 25: NOT closed.** `RiverMaterial.ts:227`'s 0.34 alpha
floor is confirmed present, but no river has been photographed. My first probe
walked `riverWater.geometry` by `userData.lateral`, which does not exist;
`l7frames.mts` uses `Water.riverJoins` instead and its run is still pending.
`riverStats` says 1837 stations over 9 reaches, and `riverJoins` is published
specifically because a confluence is the one thing no corpus shot can show.

## Task 24 — verified

`tmp/shots/l7/r2/storm.jpg` and `f1/storm_ground.jpg`, read: the rain now has
**visible curtains** — dense bands upper-left and upper-right, a clear lull
through the middle — and streak length and brightness vary drop to drop. Before,
every streak was the same length, brightness and spacing across the entire
frame. **Verified by eye.**

**Splashes: cause found, fix landed, frame not yet read.** Measured rather than
guessed: `storm` sits 21.6 m up looking horizontally at 46 deg, so the bottom of
the image meets the ground about **25 m out**, and the splash fade
`1 - smoothstep(uExtent * 0.55, uExtent, d)` was at zero by 22 m. Every ring was
drawn behind the near edge of what the camera was looking at. Now extent 64 m,
fade in the last fifth, 14000 instances, 50 mm ground bias, opacity up.

**The hole this does not close.** `tf_height` is the heightfield; it knows
nothing about the road, the apron or the Hammerhead forecourt slab, so a splash
under a prop sits at terrain height and is correctly depth-rejected by the prop
above it — and the judged storm frame is mostly tarmac. The fix is a
depth-buffer read, not a bigger number. Residue, filed.

## Gates run (individual, not the suite — the coordinator owns `pnpm run check`)

- `node src/tools/hydrocheck.mts` — **PASS.** "4 channels are percentiles and
  every lift clears the null by 2x"; `wet median 0.502 ok`; wet p99 lift 74.81
  against a 1.07 null, 70.06x. Taken while the box was **busy** (sweep queue
  depth 50, all prewarm) — it is a CPU gate on the field, not a timing, so
  contention does not bear on it.
- `node src/tools/orphans.mts` — 318/318 reachable. (It failed once inside a
  `pre-commit`, transiently, on a co-lane's in-flight untracked module; the
  hook builds the *working tree*, so an orphan gate on a shared trunk reports
  other lanes.)
- `npx tsc --noEmit -p tsconfig.json` after every edit — clean. This caught two
  separate backtick-inside-`/* glsl */` breakages of my own before either
  reached a co-agent's capture.
- `pre-commit` (build + both typechecks + 4 cheap gates) green on all eight
  commits.
- **No perf number taken.** The box was never quiet: `harnessstats` shows the
  sweep queue at 40–50 prewarms for the whole session and `shoot` alone at
  121.7 minutes over 103 runs. Any figure taken tonight would be one of the
  numbers LANDMINES is about.

## Commits

| sha | what |
|---|---|
| `9adfded` | cross-lane unblock: `GradePass` shader had not compiled since `ff8f459` |
| `c6f05b1` | task 26 — `gradePad` arc-length UV |
| `498127e` | task 23 first pass — group envelope, calm ramp, shoaling, refraction, per-body fetch |
| `24f58ed` | task 24 — rain gust field and per-drop variation |
| `f7b87a1` | withdraw the duplicate `uNear`/`uFar` after lane 15 landed the same fix |
| `8c900dc` | task 23 second pass, from its own frames |
| `e082127` | task 25 findings 1 and 2 — chop unscaled by fetch; reflection distortion |
| `0189065` | task 24 — splash extent, fade, bias, opacity |
| `9f5dd37` | task 25 finding 3 — the slab's sheen over its own beach |

## Next step, exactly

1. Read `tmp/shots/l7/w3/{zone_galdin,zone_vesperpool,storm}.jpg` (cold, at
   `0189065`) and `tmp/shots/l7/f3/*` (the `l7frames.mts` derivation: every
   body from its bank, three confluences). **Nothing after `9f5dd37` has been
   looked at**, including the alpha gate, which is the change most likely to
   have a side effect — check no shoreline lost its swash.
2. If the near field of a lake still fizzes under overcast, that is Fresnel
   picking the bright sky off scattered facets at 10–60 m. Ablate before
   re-tinting: `--hide` the shore ribbon, then zero `uRoughness`, and see which
   moves it.
3. The river half of task 25 is open — see above.

## Harness note for whoever picks this up

Late in the session `shoot.mts` started returning

    Error: page.waitForFunction: Timeout 300000ms exceeded.
        at preparePage (daemon.mts:1714)

on a four-shot cold capture. Nothing in the tree changed to cause it: the same
sha had captured cleanly twenty minutes earlier, `cleanup.mts` reports "clean —
no orphaned servers or browsers", and `daemon.mts --health` shows **4 of 4
workers busy with a sweep queue of 50, every entry a `prewarm`**. That is a
prewarm per commit, and eight lanes committing small and often is exactly what
the CLAUDE.md advice produces. `harnessstats` for the window: `shoot` alone
103 runs / **121.7 minutes**, chromium RSS p90 9798 MB, peak 13527 MB.

Then, twenty minutes later, every in-flight tool died with `ECONNRESET`/`socket
hang up` at once and `--health` came back with **`uptimeSec: 9`**: the daemon had
restarted under them. Same lesson from the other side -- a tool that dies mid-run
on this trunk tonight is far more likely to be the shared daemon than the code.

It reads as a crash and it is a queue. Re-run the capture rather than bisecting.

**Two bake caches are missing and `--health` says so:**

    src/public/baked/texc.bin.gz  (painted faces, ~2.5 s/boot)  -> pnpm run build:full
    src/public/baked/geo.bin.gz   (POI/mega/shore, ~1.2 s/boot) -> node src/tools/texbake.mts --geo

The geo one is **lane 7's own doing and is expected**: `src/world/Water.ts` and
`src/world/props/Wear.ts` are both in `GEO_SOURCES`, so every commit tonight
invalidated it correctly. It needs regenerating before anyone measures a boot.
`texc` is a `pnpm run build` somewhere, per its own warning text.

## The judged frames after everything — `tmp/shots/l7/w3/`, cold, at `9f5dd37`

Read with the Read tool. No page errors, so every program linked.

- **`zone_galdin` — the tell is substantially addressed. Verified by eye.** The
  horizon is a smooth graded deep blue instead of corduroy; the mid-field
  carries visible patches of ruffle and calm (the set envelope); the near band
  has visibly coarser wavelets than the far band, which is the wave-scale
  variation the task asked for; the shallow margin is a clean pale sand-under-
  water shelf again, with the mottle gone; and the waterline is a natural bed-
  derived edge with no hard slab line. **One regression to watch:** the white
  foam band along the right-hand beach is fainter than in `base`. The alpha gate
  (`9f5dd37`) zeroes the first 6 cm of depth, which is exactly where foam is
  strongest. If a judge calls the surf weak, that is the term to look at first —
  gate `foam` out of the multiply rather than widening the ramp.
- **`zone_vesperpool` — better, not resolved. Verified by eye.** There is now a
  real near-to-far gradient: the water past the headland is smooth and takes the
  pale cliff-and-sky tone, and the near water is coarse chop with visible light
  and dark patches instead of uniform white sandpaper. The cliff still does not
  appear as a recognisable *image* in the lake — under overcast at that
  depression angle the reflection is a dark tone rather than a picture, which
  may be right, but it has not been proven either way. Next instrument: ablate
  the reflection (force `refl` to magenta) and see how much of the lake it owns.
- **`storm` — streaks verified, splashes still not visible.** The curtains and
  the per-drop variation read clearly. The near ground in this frame is almost
  entirely the Hammerhead tarmac, which is a prop, so this frame cannot show a
  splash however large the field is — see the residue item. `storm_ground` is
  the framing that would answer it and its ground is tarmac too. **A framing
  over bare terrain under a storm still does not exist**; that is the one thing
  left to prove for task 24.

## Correction, and the last thing found (2026-08-31, end of session)

**The Vesperpool is one of the four flood-filled SEA basins, not a tarn.** Its
level is the global −6.5 and its `waveScale` is therefore ~1, so `fk` was 1 on
it all along and the corduroy on `vesper_low.jpg` was **never** a fetch-scaling
artefact — `e082127`'s message implies otherwise and is wrong on that one point.
The crosshatch finding is correct for the Maidenwater, which is a real tarn.
What actually improved the Vesperpool was `calmFar` and the reflection-distortion
cut. This is exactly the LANDMINES pattern — a correct negative, an inference
from it that was never itself tested — caught only because
`probes/l7frames.mts` printed the bodies.

`Water.bodies` on this seed: **four `sea` basins** (`_findBasins` slices to
four) plus one per authored fishing pin. A plain sort by area returns four
frames of the same ocean and no pond at all, which is what the probe's first run
did; it picks two seas and three tarns now.

**`Water.riverJoins` came back EMPTY** while `riverStats` reported 1837 stations
over 9 reaches. Either this seed's routing finds no confluence, or `riverJoins`
is not being populated — and `Water.ts:150`'s docstring says it is published
*specifically* because a confluence is the one thing no corpus shot can show.
Worth ten minutes from whoever takes the river half of task 25.

**The last defect found, and it was mine.** `tmp/shots/l7/f3/l7-body1-sea.jpg`
— the first bank-height frame ever taken of a sea body — has a row of hard
rectangular blocks along the far waterline and a blocky quantised mottle through
the shallows. `wf_bed` interpolates the height field's cells, so it returns a
piecewise-bilinear surface, and **any fixed contour of one follows the cell
edges**. `9f5dd37` put a 6 cm contour of exactly that field into the alpha.
`cf41e2f` breaks the threshold up with `churn`, the 11.8 m wave noise the foam
band already uses, over 0.04–0.46 m.

**Not verified — this is the next frame to read**, `tmp/shots/l7/f4/`. And be
careful with the far-waterline blocks specifically: they are at the ~4 m pitch
of the grid, but `water/Shore.ts`'s ribbon rows and the clipmap's own stitching
are both candidates and **neither has been ablated**. `--hide` the shore ribbon
first. Do not read `cf41e2f`'s message as having settled it.

## MEASURED NEGATIVE: the waterline blocks are not the alpha contour

`tmp/shots/l7/f4/l7-body1-sea.jpg` against `f3/l7-body1-sea.jpg`, same derived
pose, `cf41e2f` against `9f5dd37`. **Unchanged.** Breaking the alpha threshold up
with `churn` over 0.04–0.46 m did not move the rectangular blocks along the far
waterline or the blocky mottle through the shallows by anything visible. So the
inference in `cf41e2f`'s message — that the blocks are a contour of the bilinear
bed — is **wrong**, and the commit is a no-op for this defect. (It is still
defensible on its own terms: a hard isoline in the alpha is a stamped edge
whether or not it is the thing making these blocks. It is not a fix.)

**What the blocks actually look like**, described rather than named: evenly
spaced flat rectangular slabs lying *along* the waterline, at a roughly 4 m
pitch, foreshortening correctly with distance, and reading as if they sit
slightly **above** the water rather than in it. They span the full width of the
frame. The shallows inboard of them carry a matching rectangular light/dark
patchwork.

**The remaining candidates, in the order to ablate them:**
1. `water/Shore.ts` — the swash ribbon is 21 elevation rows merged into one
   mesh, and one row's worth of quads standing proud is exactly this shape.
   `shoot.mts --hide` the ribbon; if the blocks go, it is this. **This is lane
   7's own file** and the first thing a respawn should do.
2. The terrain clipmap's LOD stitching at the level boundary that happens to
   fall near the shore.
3. The bed grid, still — but the `churn` disproof above argues against it.

This is the largest visible defect left in any water frame I took, and it has
never been in a judged shot because every corpus shoreline is 250 m+ away. It
was found by the first bank-height frame of a sea body, which is the whole
argument for task 25.
