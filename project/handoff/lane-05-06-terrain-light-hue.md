# Lanes 5+6 — Light in shadow + hue range (cold-start brief)

Owns: lane 5 = `src/world/terrain/**` except `Field.ts` (TerrainMaterial,
Layers, Horizon, Biome, Clipmap, Road). Lane 6 ("zone palettes") has no
directory: its files are `terrain/Biome.ts` (in lane 5 — same agent) and
`veg/Biomes.ts` (lane 3's tree → explicit-pathspec one-liner). Task 21's
`uCloudShadowStrength` lives in `Sky.ts` = lane 4's file → named one-liner.
`Field.ts`, `Shots.ts`, `postfx/` are not yours.

## Anchors per task

**18 — sky fill in shadow.** An ambient term EXISTS; it is small and doubly
occluded, not absent.
- The whole diffuse ambient is one L2 `THREE.LightProbe`:
  `sky/SkyProbe.ts` (:49, update :113, upwardIrradiance :195), added at
  `Sky.ts:630-631`, intensity written per frame at `Sky.ts:1105`
  (`PROBE_GAIN = 1.0`, `Sky.ts:30`; `?post=noambient` zeroes it).
- Env cube is specular-only: `uEnvDiffuse` default 0.0 (`Sky.ts:831`),
  injected `MaterialPatch.ts:171-172`. The probe is the ONLY sky fill.
- Probe irradiance clamped ≥0 at `MaterialPatch.ts:145-146`.
- Terrain multiplies it twice: `TerrainMaterial.ts:1882-1892` (FRAG_AO) —
  `tfAmb = tfAO * mix(1, tfSkyAo, uHorizonMix.y)` then
  `indirectDiffuse *= mix(1.0, tfAmb, 0.85)`. `tf_horizonAo`
  (`Horizon.ts:428-445`) folds the normal in, so a shadow-side slope loses
  fill AGAIN and gets no directional sky colour. `uHorizonMix` default
  `(1, 1, 300, 620)` at `TerrainMaterial.ts:2085`.
- `Sky.fill` (`Sky.ts:632`) is NOT a light — only Water and Weather read
  it; editing it does nothing to terrain.
- Ranked levers: PROBE_GAIN; the `mix(1.0, tfAmb, 0.85)`; `uHorizonMix.y`;
  a directional fill (tint indirect by bioCool/sky azimuth); `uEnvDiffuse`
  off zero (double-counting risk — SkyProbe was built to remove exactly
  that; measure with `?post=noprobe`, Sky.ts:703).

**19 — de-posterise.** Dither is NOT absent — find which stage quantises
before authoring.
- `GradePass.ts:152-153` temporal dither floor 1.5/255; `:146` grain is
  mid-weighted `4*l*(1-l)` ≈ 0 at l<0.05 — the darkest band carries 1.5
  LSB alone.
- `CasPass.ts:144` second ordered dither (final display pass).
- LUT 32³ Uint8 (`grades.ts:249-368`) sampled trilinear; shadow EXPANSION
  below knee 0.06 with slope 1+toe*4 (`grades.ts:295-305`) multiplies
  upstream quantisation ~1.2×.
- Buffers all HalfFloat — no 8-bit intermediate. **Likeliest false
  positive: the judge read `--jpeg` (q82) at 3×.** Re-shoot PNG on the
  same boxes BEFORE authoring anything; may close as measured negative.

**20 — mid-frequency geology (0.65→300 m).** Both ends are shading: GTAO
radius 0.62 m fading 220→650 m (`PostFX.ts:282-315`); the horizon bake's
shadow half fades IN at 300→620 m (uHorizonMix.zw). Nothing occludes
between.
- Exists in-band: tier-C mesorelief 4-30 m
  (`TerrainMaterial.ts:1675-1757`, `?post=nomeso/mesomax`); analytic
  strata/laminations (:800-880); talus splat (:590-596); runnels
  (`?post=nogully`); near detail ~2.9 m (`uNearScale` :2093-2095).
- Missing: drainage as a network (flow = ctrl.r, consumed only as splat
  weight) and 30-300 m form — `reliefstat` measures the shortfall (d8
  11.8 vs 18.4, d16 12.1 vs 21.2, d32 13.3 vs 21.8, quoted :1682-1687).
- Layer recipes: `Layers.ts` (LAYER_AVG :55-62 re-derived by
  `layeravg.mts` — **required after ANY recipe edit** or the far-LOD seam
  returns).

**21 — vannath floor.** Cloud shadow multiplies DIRECT light only
(`MaterialPatch.ts:119-122`, injected :131). Under a patch only the probe
remains → tasks 18 and 21 are the same floor. `uCloudShadowStrength`
default 0.62 (Sky.ts:817), preset `clear` **0.78** (:318), written :1271.
zone_vannath = 17.2 h clear (Shots.ts:474). Patch ≈640 m = uShadowTile
2700 (:815) × shadowScale 3.5 (:1288). `?post=nocloudshadow/noclouds`
(Sky.ts:704-705).

**22 — one hue per frame.** The palette is `terrain/Biome.ts`: SURFACE
:48-100 (ground/rock multipliers, green, damp), surfaceAt :142, BLEND_POW
2.4 :117, baked by buildBiomeLut :188; shader reads two textureLod
fetches at `TerrainMaterial.ts:546-558` (bioGround/bioRock/bioGreen/
bioDamp/bioCool).
- `three_valleys: ground [1.09,.96,.81], rock [1.11,.97,.83], green .08,
  damp 0` (Biome.ts:54) — warm × warm with bioCool ≈ 0.07 so the strata
  desaturation (:854) never fires. Brown ridge to horizon.
- **WorldMap.ZONES has no albedo tint** (its `tint` is the map-screen
  colour). Don't look there.
- Accent levers outside terrain albedo: `veg/Biomes.ts:139-145`
  three_valleys (dry 0x8f8257 / lush 0x62663a, treeTint, scrub mix) via
  `Ecology._grassRamp` (:904-910) — note the recorded failure "1.76× red
  = highlighter yellow"; rock tint variance `Rocks.ts:793-816` (±6%);
  strata endpoints (:846-849); mesoPale/mesoLag (:1751-1752).

## Mechanism notes
- Terrain = MeshStandardMaterial patched twice (MaterialPatch then own
  onBeforeCompile); cache key constant `'terrain-surface'` — a new
  UNIFORM is free, a compile-time branch is not.
- FRAG_AO runs at `<aomap_fragment>` (after lights_fragment_end) — one
  injection scales both direct and indirect.
- Probe and env cube re-bake together; new fill must not be metered or
  exposure cancels it (Sky.ts:1096-1101 excludes golden-hour fill from
  the meter deliberately).
- `shadowmask.mts` paints the darkest-quartile mask — prove the quartile
  is ground before filing against albedo; `?post=gwhite/gwarm`
  (TerrainMaterial.ts:52-60) are floor/ceiling controls.

## Commands
```
node src/tools/shoot.mts zone_vannath zone_three_valleys vista_overcast vista_fog --out tmp/shots/l5-base    # PNG, never jpeg for measurement
node src/tools/crop.mts tmp/shots/l5-base/zone_vannath.png tmp/crop/vannath-core.png 520 560 220 140 3
node src/tools/regionstat.mts tmp/shots/l5-base/zone_vannath.png 0.33 0.62 0.46 0.78    # ≥30/255 gate
node src/tools/imagestats.mts "tmp/crop/*.png" --against FFXV-field
node src/tools/reliefstat.mts tmp/shots/l5-base/zone_three_valleys.png --roi 0.1,0.6,0.8,0.35 --against FFXV-field-ground
node src/tools/shoot.mts zone_vannath --ablate noambient --out tmp/shots/l5-noamb
#   noambient noprobe noenv nocloudshadow noclouds nogtao nolut nomeso mesomax noiao iaomax nogully nodry drymax gwhite gwarm nostoch
node src/tools/layeravg.mts        # after ANY Layers.ts recipe edit
node src/tools/check.mts && node src/tools/nanscan.mts
```

## First commits
1. **Instrument first:** PNG baselines + regionstat on named crop boxes
   (vannath core + p50 box, overcast, fog) + reliefstat d1-d32 for
   three_valleys. Nothing lands before these numbers exist.
2. **19 before 18:** re-measure the bands on PNG at 3×; localise with
   `?post=nolut` or close as a jpeg-artifact measured negative.
3. **18** smallest step first: raise the tfAmb mix floor and/or
   PROBE_GAIN; ablate vs noambient; report shadow-side Y p50 + R−B.
4. **21** as its own explicit-pathspec Sky.ts one-liner (cloudShadow
   0.78 for clear and/or shadowScale), verified on identical boxes.
5. **22**: Biome.ts three_valleys row (lift green/damp or push rock off
   the ochre axis so bioCool engages) + paired veg/Biomes one-liner.
   Verify with surfaceAt() at the shot target, not the authored number.
6. **20** last and largest — a mid-frequency field with its own `?post=`
   ablation pair, priced by reliefstat d8/d16/d32.

## Landmines
- The Taelpar "wood grain" was the rock TILE, not the strata — wrong
  twice; recipe 3's comments carry the history. Bedding is
  threshold-gated by bioGreen (:869-878) — don't lerp it back.
- The chevron hatch on peaks is GTAO (`?post=nogtao`), not fixable from
  terrain.
- Zone blend dilutes small zones (Ravatogh ~78% at own centre) — measure
  surfaceAt() before authoring a row. Centres are cx/cz, never x/z.
- mencemoor corduroy is CLOSED as not-worth-it — do not reopen.
- Dark near-ground in green zones is veg + cloud shadow, not palette.
- `?post=drymax` is a measured negative for band 20 (d1/d2 overshoot,
  d8-d32 flat) — no more sub-metre mat.
- Adding a light or a SECOND probe recompiles every program (9.5 s) —
  extend the existing probe.
- Two captures differ ~1.5/255 — thresholds trace to that.

## Done-when
18/19: same boxes — overcast/fog shadow-side Y p50 up, R−B cooler, no
band edges on PNG at 3×; `?post=noambient` reproduces the old frame — or
19 closes as measured negative with the jpeg evidence. 20: reliefstat
d8/d16/d32 move materially toward 18.4/21.2/21.8 without d1/d2
overshoot, with a paired ablation. 21: audit boxes ≥30/255 and patches
within 2× of their clouds. 22: three_valleys shows a second hue that
survives a sky-matched slice (build the slice first —
`imagestats.mts:418`'s own caveat). check green, nanscan 0, ≤800 draws,
layeravg re-run if a recipe changed.
