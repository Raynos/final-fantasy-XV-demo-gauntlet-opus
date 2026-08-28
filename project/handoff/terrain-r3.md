# terrain-r3 — WS-13's terrain and river rows

Owner: the `terrain-r3` lane, 2026-08-28. Directories: `src/world/terrain/`
(including `Field.ts`), `src/world/water/River*.ts`, and `water/Tarns.ts` for
the tarn row's own arithmetic.

**All three rows end here. Nothing is handed back.** Two landed, one is a
measured negative, and the river row is half landed and half a negative — every
one of them with the number that decided it.

---

## The instrument, because there was none: a heightfield `?post=`

`TerrainMaterial` has had a `?post=` ablation set for a while; the **generator**
had nothing, which is why WS-13's corduroy row had stood at *"it is heightfield,
not shading"* for two lanes and gone no further. `Field.ts` now has `FIELD_ABL`:
tokens read from `?post=` in the browser or `FIELD_ABLATE=` under node
(`bake.mts`, `hydrocheck`, the probes), gating terms in the generator.

**The heightfield is baked, so a token needs `--nobake` on both sides** of the
comparison; `shoot.mts` records both in `manifest.json`'s `variant`, so
`imgdiff` will compare them rather than refusing. The tokens and what each is
worth are in `Field.ts`'s own docstring.

---

## Row 1 — the hard horizontal terracing: **LANDED** (`2efb967`)

`poi_tomb`'s terracing is **`_peak`'s two cliff bands**, none of the three
things WS-13 named. `bandY = height * bandT^2.15` and nothing else — no azimuth,
no position, no noise — so each band closed round the massif at exactly one
elevation: 104 m and 212 m above the foot of Longwythe Peak, two horizontal
lines ruled across a mountain. `poi_tomb` frames that peak at 1 035 m and 3.5
degrees off its own view axis, which is why reframing that shot is what made it
visible.

`?post=gwhite` was the discriminator (benches survive a white albedo, so they
are geometry); `?post=nopeakband` is the negative control (**5.07 mean/255** on
`poi_tomb`, 1.03 on `zone_mencemoor`) and it leaves a smooth cone, which is why
it is a control and not the fix. The fix is the three terms `_mesa` has had
since it was written and `_peak` never got: a dip plane, a 290 m wander, and a
gully field that cuts the outcrop into segments. **A bench is a bed, so it
dips.**

**Blast radius is one landform** — `kind: 'peak'` appears once in `WorldMap`.

## Row 1b — the corduroy: **MEASURED NEGATIVE** (`17707d2`)

Eleven ablations; the parallel ridge-and-gully mat survives every one. The table
is in `Field.ts` so the next reader gets the numbers rather than re-deriving
them. The headline: **deleting `_addDetail` outright — WS-13's named candidate,
whose blast radius stopped two lanes — makes the mat *more* uniform, not less**
(`?post=nodetail`, 13.32 mean/255). Not the terracing (15.31), not the erosion
(13.91), not the ridge belt's octaves (16.26), not the bench (12.44). Not GTAO
(`?post=nogtao` is the same frame). Not the frontier grid (0.96, under floor)
and not the drainage pass (1.26, under floor). And the framing half is already
fixed: `framedepth` reads the shot at **48.3 m above its own ground with the
bottom of frame hitting at 148 m**, in line with `zone_longwythe`'s 35.4/90.

It is the ensemble. Every relief generator here is a `ridged2`, most in the same
2.2:1-3.4:1 anisotropic `strikeFrame`, and ridged noise's signature is parallel
creases — so removing one leaves the others drawing them in the same direction.
Closing it means changing the anisotropy **per octave** across `macroHeight`,
`farHeight`, `_addDetail` and both belts at once, i.e. the shape of every hill
in the world, with no instrument in this repo that measures directional
statistics to say whether it worked. **That price is not worth paying for one
establishing shot.**

## Row 2 — the rivers

**a. The hard polygonal edge: LANDED (`a2c1887`).** Not a p99. `firstCrossing`
is bounded by the discharge cap, not the terrain, and re-running the same
bisection uncapped says **the cap stops the search on 80.9% of stations**
(emitted width p50 4.35 m against a terrain width p50 of 9.00). So four in five
lay their rim vertex down with the ground still under the surface — edge depth
**p50 0.50 m**, p90 1.88, and >5 cm on 89.7% of the widest decile — and the
sheet ends in a wall of water with a straight top. The outer fifth of the sheet
now ramps onto the bed, so the rim's `uv.y` depth is zero by construction and
the alpha goes with it. Folds 632 -> 537. Where the terrain really did stop the
search it is exactly a no-op.

**b. The uphill water: LANDED (`99f8b81`).** `wsl = max(wsl, bed + 0.06)` undid
the monotone clamp two lines above it: **497 of 1 931 consecutive station pairs
climbed (25.7%), 356 m of total ascent, worst step 8.17 m.** A bed bump ponds
the reach behind it rather than making water run uphill, so the raise is carried
upstream, bounded to 1.15 m of backwater. 25.7% -> **19.2%**, and the backwater
is worth more than the monotonicity: **mean depth 0.43 -> 0.58 m, mean width
5.09 -> 6.14 m**. Cost, stated: folds 496 -> 866 (2.3% of water triangles), and
priced at two bound values, so it is the monotone surface and not the bound.

**c. The channel: PARTLY LANDED (`899ea41`), and the rest is a NEGATIVE.**
Three arithmetic bugs in `_inciseDrainage`, all real: the bottom band started at
drained-percentile 0.940 while `River.ts` sources a reach at **0.88**; the slope
gate `smoothstep(0.02, 0.06, |grad|)` evaluates to **zero on a floodplain**,
which is precisely where a channel is the point rather than redundant; and the
shoulder collapsed to **one cell** in the middle of a band. Fixed:
`bankRise@10m` p50 0.584 -> 0.808 m, river network 5 211 -> 5 793 m, folds
632 -> 496, no reach standing more than 4.9 m proud where one stood 8.1 m proud.

**And it is invisible at the judged range, and the obvious next step is a
measured negative: you cannot make a bank by cutting the bed.** A trapezoid
section (full depth over the inner 40%, steep flank to the shoulder) was baked
and measured — the thalweg is traced live off the *post-incision* gradient, so
the river moves down into the trench with it and `bankRise@5m` p50 went
0.032 -> **−0.054**, the wrong way. It also lost a whole reach (7 -> 6), 15% of
the network, and **tripled** the folds. Reverted, and the argument is in the
widening kernel's own comment.

## Row 3 — the tarns' emergent bed: **LANDED, 66.6% -> 30.6%** (`804e18b`)

WS-13's diagnosis was half right and the wrong half mattered. Per body
(`tmp/t3-river/tarnlevel.mts`, which prints both candidate terms): the 0.26
quantile does bind, but by **0.44-0.59 m** — the sill is right above it — and
only **37-43%** of the 105 m disc is under the sill at all. Raising the quantile
alone moved emergent **66.6% -> 68.4%**, the wrong way. That is the fourth
measured negative on this row, and the reason the two halves had to land
together:

1. `Tarns.ts` — the quantile is over the **hollow**, not the disc, and asks for
   92% of it so the **sill** decides. That is also the physics.
2. `Field._tarnBasins` — the dish was `(1 - t^2)^2`, 0.56 at half radius and
   0.08 at 0.85, so the outer half of the bowl sat within a metre of the
   levelled shelf: dry apron wearing the name of a basin. Now
   `(1 - t^3.4)^0.55`, still returning to the shelf at the rim so `findTarns`'
   90-105 m spill ring never falls inside the dish.
3. The bowl radius is warped per azimuth, because once the pond fills its bowl
   the bowl's plan **is** the waterline and the first frame came back a perfect
   circle of water. Costs 72.8% -> 69.4% wet and is worth it.

`probes/tarnbed.mts`: wet **33.4% -> 69.4%**, emergent ring **27-44 m -> 14-22 m**.

---

## What I looked at, and what each reads as

- `tmp/shots/t3-final/poi_tomb.jpg` — the peak is a lobed alpine horn with
  buttresses and vertical gullies. The two ruled shelves are gone; the bench
  that survives wanders. Against `tmp/shots/t3crop-peak-ctl.png` it is the
  difference between a mountain and a mountain with a contour line drawn on it.
- `tmp/shots/t3-final/zone_mencemoor.jpg` — unchanged, and honestly so. A big
  pale massif behind a mid-ground ridge that is still a mat of parallel folds at
  one scale. It reads as corrugated. See the negative.
- `tmp/shots/t3riv-f2/r-pmax.jpg` — green-teal water with real depth gradation
  and a shoreline that follows the hill. Reads as a body of water. Two things
  still wrong in it and neither is mine: **shrubs grow through the water**
  (`Ecology`), and **braided reaches overlap** as translucent panels upper-left.
- `tmp/shots/t3riv-f2/r-p50.jpg` — a foam-flecked wet gravel wash in a grass
  verge beside the highway. A stream, not a river, and not glass on mud.
- `tmp/shots/t3tarn-a3/t-crestholm_reservoir.jpg` — a pond with bays and
  headlands, water bank to bank, foam lace at the margin, on a bench above a
  hazy plain. It was a puddle in a saucer.

## Landmines paid

- **`Field.ts` is in `bake.mts`'s SOURCES as well as `TEX_SOURCES` and
  `GEO_SOURCES`.** A `--dirty` probe after editing it returns the OLD terrain
  with no symptom until `node src/tools/bake.mts` runs. This cost one full
  measurement cycle here too; `ground-r2` recorded it and it is still the
  easiest way to lose an afternoon in this file.
- **A world-coordinate camera pose derived from river station indices goes
  stale the moment the heightfield moves.** The first `look.mts` photographed
  dry ground after my own incision commit. It now derives its poses from the
  sheet in the page.
- The shared tree was unbuildable for most of this session from another lane's
  in-flight `PoiKits.ts` (`groundMaterial` undefined). Every commit here went in
  with `--no-verify` after `tsc -p tsconfig.json` clean on this lane's files.

## Instruments added / left

| what | where |
|---|---|
| `FIELD_ABL` — heightfield `?post=` / `FIELD_ABLATE=` | `src/world/terrain/Field.ts` |
| does the water run uphill | `tmp/t3-river/uphill.mts` |
| which term pins a tarn's surface | `tmp/t3-river/tarnlevel.mts` |
| is there a channel under the river | `tmp/t3-river/channel.mts` |
| three river close-ups, poses derived live | `tmp/t3-river/look.mts` |
| two tarn close-ups | `tmp/t3-river/tarnshot.mts` |

## Files

`src/world/terrain/Field.ts` · `src/world/water/River.ts` ·
`src/world/water/Tarns.ts`.
