# Lane 4 — Clouds (cold-start brief)

Owns: `src/world/Sky.ts`, `src/world/sky/Clouds.ts`,
`src/world/sky/CloudTextures.ts`, `src/shaders/clouds.glsl.ts`, cloud block
of `src/shaders/sky.glsl.ts`. Do NOT touch Shots.ts (lane 3), terrain
(lane 5), post/grain (lane 15). Plan: tasks 15–17. Judge:
`project/journal/2026-08-27-critic-round-16.md:96-104`.

## Anchors per task

**T15 organisation (streets / cell-size variance).** Coverage is one baked
512² weather map tiled every `uWeatherTile` 27 km (`Sky.ts:801`), built in
`CloudTextures.ts:226-289`:
- `:259` `cov = valueFbm2(fx*12 …, 12, 4)` — 12 cells / 27 km = 2.25 km
  dominant blob, domain-warped `:257-258`.
- `:261-262` `streak … wCov = cov*(0.72+0.42*streak)` — **the only
  anisotropic term; streets must come from here** (15×5 cells, ±22%),
  applied before `stretch(wCov,0.01,0.99)` `:279`.
- `:267` `wType` 5 cells, `:275` `wVar` 7 cells — the per-cloud-difference
  channels; comments `:263-274` carry the 20→7 history.
- Consumed at `clouds.glsl.ts:84-97 cloudWeather`: `wc = smoothstep(
  uCovRange.x, uCovRange.y, w.r) * (0.48 + 0.98*w.b)` — cell-size variance
  today lives only in that `w.b` multiply and `uCovRange` (`Sky.ts:279-296`
  explains covHi 1.02→0.92).
- Shape volume: `uCloudBaseTile` 4200 (`Sky.ts:798`), `uCloudVertTile`
  3600, second octave 2.63× (`clouds.glsl.ts:137`), erosion tile 900.
  Volume bake `CloudTextures.ts:154-200` (worley 4/8/16/24 over 64³).

**T16 crisp top edge.** March target = `MARCH_SCALE` 0.45 (`Clouds.ts:16`)
→ 720×405 at 1600×900 (`setSize` :542-549). Upsample:
`sky.glsl.ts:318-352`, 3×3 Gaussian radius `uCloudTap` **0.90** march
texels (`Sky.ts:761`). March loop `Clouds.ts:186` (192 iters), fine step
`clamp(t*0.017,30,440)`, `MISS_MAX` 6 (`:133`). **Half-res is NOT the edge
story — measured:** MARCH_SCALE 0.45→1.0 changed a 2× vista_noon crop by
almost nothing (`archive/handoff/clouds.md:103-109`); the ramp is
geometric — a 2.25 km cloud at 20 km subtends ~160 px and its density ramp
is 10% of that (`sky-clouds.md:155-161`). T16 lives in the density-ramp
steepness at the silhouette (`cRemap` :143, `uCloudDetailAmt`) and
`uCloudTap`, not resolution.

**T17 dynamic range.** `cloudDensity` chain (`clouds.glsl.ts:104-174`):
shape remap `:132`, early-out `:135`, octave `:137-138`,
`e = cRemap(shape, 1-cov, 1, 0, 1)` `:143`, erosion `:152`,
`* uCloudDensity` `:173`. Lighting: 3-octave sum `:264-270`, `uCloudMS`
0.62 `:278`, `energy *= uCloudSunGain` `:279`, powder `:282`, `uSilver`
`:287`, `uAmbBury` 2.4 `:331`, **soft knee `sunL *= uCloudMaxRad/
(uCloudMaxRad+pk)` at `Clouds.ts:365`, `uCloudMaxRad` 9.5 :516`.**

**Presets.** `WEATHER` `Sky.ts:267-372` (clear :268, overcast :337, storm
:351, fog :368) → `_pushWeatherUniforms` :1261-1295; only silver/baseShade
reach marchUniforms (:1282-1283).

## Mechanism notes
- **`uCloudSunGain`'s base is NOT 0.42** — the constructor value
  (`Clouds.ts:509`) is dead; `_applyTimeOfDay` overwrites every frame:
  `Sky.ts:1035-1036` `uCloudSunGain = lerp(0.26, 0.20, overcast)`. Edit the
  lerp. (The plan's "base 0.42" is wrong; correction recorded at
  `sky-clouds.md:163`.)
- The knee compresses crown-to-body by `m²/(m+pk)²` (`clouds-r2.md:148-153`)
  — gain cuts are sublinear (40% cut moved clip% 43.7→35.4). **T17's ratio
  lever is the knee + cRemap steepness, not gain alone.**
- `cloudDensity` has three consumers: screen march, ground-shadow bake
  (`SHADOW_FRAG` `Clouds.ts:410-450`), env cube (`CLOUD_ANALYTIC` :239).
  Coverage changes move lane 5's task 21 and the IBL — announce them.

## Commands
```
node src/tools/shoot.mts vista_noon zone_vannath zone_three_valleys vista_dusk zone_longwythe zone_lestallum --out tmp/shots/l4-base
node src/tools/shoot.mts vista_noon --out tmp/shots/l4-tap0 --ablate cloudtap0   # also cloudtapmax, nocloudjitter, nocloudsun, nocloudamb, noambbury, noclouds, nocloudshadow (Sky.ts:704-742)
node src/tools/crop.mts tmp/shots/l4-base/vista_noon.png tmp/l4/noon-cloud.png 620 40 340 220 1
node src/tools/imagestats.mts tmp/l4/noon-cloud.png      # read `stops` = log2(linP99.9/linP0.1)
node src/tools/edgestat.mts tmp/shots/l4-base/vista_noon.png --roi 620,40,340,220
node src/tools/regionstat.mts tmp/shots/l4-base/vista_noon.png 0.39 0.04 0.60 0.28
node src/tools/probes/perfcsm.mts
pnpm run check && node src/tools/probes/nanscan.mts && node src/tools/perf.mts vista_noon storm zone_lestallum
```

## First commits
1. **Instrument first:** fixed crop boxes per shot, crop→imagestats +
   edgestat on the same box; record baseline stops (0.87–1.06) and edge
   hard/p90 in the handoff BEFORE tuning.
2. T15a streets: raise `:261-262` anisotropy with a real aspect ratio, fix
   its tiling bug (landmine 1).
3. T15b cell variance: widen `w.b`'s influence in `cloudWeather` and/or
   drop `wVar` to ~4-5 cells; re-check covLo/covHi.
4. T17: knee (`uCloudMaxRad` up / shoulder) + re-balance the `Sky.ts:1036`
   lerp, then steepen cRemap `:143`. Measure stops per step.
5. T16: `uCloudTap` down against the T17 tree + silhouette-side sharpening.

## Landmines
- **The streak channel does not tile in y**: `CloudTextures.ts:261` passes
  period 15 while `py = fy*5.0` — a discontinuity every 27 km in the
  anisotropic term. Verify/fix BEFORE amplifying or you bake a seam.
- Editing CloudTextures invalidates the bake automatically
  (`texbake.mts:57`) but its args are duplicated at `texbake.mts:302-308`
  and `Clouds.ts:471` — keep in step; each rebake costs 409 ms boot.
- **Recorded negatives — do not re-spend**: full-res march, 448 iters,
  gCloudLod=0, dither decorrelation, god-rays-as-cause, TAA accumulation,
  raising exposure, raising coverage threshold, cutting uAmbientBoost,
  cutting uCloudSunGain alone. Stories: `project/archive/handoff/clouds.md`,
  `clouds-r2.md`, `sky-clouds.md`.
- `MISS_MAX` 6 must stay strictly above the coarse/fine ratio 2.0
  (`Clouds.ts:133,204`) or the deck vanishes.
- Whole-frame imgdiff mean is invalid on sky shots — mask to the band.
- `--ablate noexp` pins exposure to noon — compare same-hour arms instead.
- `imagestats` re-crops inputs to x5–95%/y5–90% — size boxes accordingly.
- `applyShot` lands every capture on frame 8 = all cascades + cloud shadow
  due (`LANDMINES.md:655-670`).

## Done-when
Cloud-crop stops ≥2.0 on vista_noon and zone_vannath at the baseline boxes
(clip% ≤2× reference, no preset losing silhouette); edgestat hard↑/p50↓ and
a 2× crop reads as a cauliflower boundary; visibly unequal cell sizes and
≥1 directional street with no 27 km seam; check/nanscan green; perf not
regressing past ruler floor (vista_noon 4.15 ms, zone_vannath 5.75, storm
5.8, zone_lestallum 6.65 — `project/baseline-perf.json`).
