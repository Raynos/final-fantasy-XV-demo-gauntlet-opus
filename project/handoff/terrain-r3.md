# terrain-r3 — WS-13's terrain and river rows

Owner: the `terrain-r3` lane, 2026-08-28. Directories: `src/world/terrain/`
(including `Field.ts`) and `src/world/water/River*.ts`.

Three rows, all of which end here — **this lane may not hand work back**.

## The instrument that made the difference: a heightfield `?post=`

`TerrainMaterial` has had a `?post=` ablation set for a while; the *generator*
had nothing, which is why WS-13's corduroy row had been "it is heightfield, not
shading" and no further for two lanes. `Field.ts` now has `FIELD_ABL`: tokens
read from `?post=` in the browser or `FIELD_ABLATE=` under node, gating terms in
the generator. The heightfield is baked, so **a token needs `--nobake` on both
sides of the comparison**; `shoot.mts` records both in `manifest.json`'s
`variant`, so `imgdiff` will compare them.

Tokens and prices are in `Field.ts`'s own docstring. Read that before opening
the corduroy again.

## Row 1 — the terracing: LANDED (`2efb967`)

`poi_tomb`'s "hard horizontal terracing" is **`_peak`'s two cliff bands**, not
any of the three things WS-13 named. `bandY = height * bandT^2.15` and nothing
else, so each band closed round the massif at exactly one elevation. Fixed with
the three terms `_mesa` has had since it was written: a dip plane, a wander, a
gully field that cuts the outcrop into segments. `?post=nopeakband` is the
negative control (5.07 mean/255 on `poi_tomb`, 1.03 on `zone_mencemoor`).
**Blast radius is one landform**: `kind: 'peak'` appears once in `WorldMap`.

## Row 1b — the corduroy: MEASURED NEGATIVE (`17707d2`)

Eleven ablations; the parallel ridge-and-gully mat survives every one. Deleting
`_addDetail` outright -- WS-13's named candidate -- makes it *more* uniform.
The table is in `Field.ts`. Not GTAO, not the frontier grid, not the drainage
pass, and the framing half is already fixed (`framedepth` 48.3 m / 148 m,
in line with the corpus). It is the ensemble: every relief generator here is a
`ridged2` in the same anisotropic `strikeFrame`, so removing one leaves the
others drawing parallel creases. Closing it means changing the anisotropy per
octave across five generators at once, with no instrument that measures
directional statistics. Not worth it for one establishing shot.

## Row 2 — the rivers

**The hard polygonal edge: LANDED (`a2c1887`).** Not a p99 — the discharge cap,
not the terrain, stops the width search on **80.9%** of stations, so the rim
vertex lands with the ground still 0.50 m (p50) under the surface. The outer
fifth of the sheet now ramps onto the bed; rim depth is zero by construction.
Folded water triangles 632 -> 537.

**The channel: IN PROGRESS.** `bankRise@5m` p50 is **+0.03 m** — five metres
from the centre of the median river the ground is exactly at the water surface.
Median river: 4.35 m wide, 39 cm deep. 48.2% of stations have ground *below*
the water at ±5 m. Cause is arithmetic in `_inciseDrainage`.

**Also measured, not yet fixed: the water runs uphill on 26.8% of consecutive
station pairs** (368 m of total climb, 8.17 m in one step). `River.ts`'s
"the surface may never sit under the ground it is drawn on" clamp undoes the
monotone clamp two lines above it.

## Row 3 — the tarn bed

Not started.

## Files

`src/world/terrain/Field.ts` · `src/world/water/River.ts`.
Probes: `tmp/t3-river/` (`channel.mts`, `confine.mts`, `look.mts`).
