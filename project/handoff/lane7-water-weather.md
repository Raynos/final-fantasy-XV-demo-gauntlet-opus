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
