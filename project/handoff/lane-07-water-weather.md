# Lane 7 — Water and weather (cold-start brief)

Owns: `src/world/Water.ts`, `src/world/water/**`, `src/world/weather/**`, and
`src/world/props/Wear.ts` (task 26 only). Do NOT touch `src/game/Shots.ts`
(lane 3 owns it) — task 25 uses probe-authored framings.

## Anchors per task

**23 · sea is one slab** — `src/world/Water.ts`
- `_makeSurface` :478 — `new THREE.PlaneGeometry(b.w, b.d, 1, 1)` rotated
  flat. **Two triangles.** No displacement; `renderOrder = 5`. Literally
  the slab.
- `_findBasins` :403 — flood-fill, every body `name:'sea', foamBand:1.35`,
  `.slice(0,4)`. `_findTarns` :469 → `water/Tarns.ts`. Sea and tarn differ
  only in level/foamBand — same `_makeMaterial` :501.
- Depth colour EXISTS and is physical: `uSigma (0.46,0.10,0.045)` :521,
  `uScatter` :528, `uBed` :530, Beer-Lambert :681, Snell path :670-673.
  Bed height via `wf_bed` :614 off terrain clipmap (`_bindBed` :316).
- **Wave spectrum is hard-coded in the fragment, no uniforms** :622-641:
  `nS` 0.0047 (swell, `swellRot` 31°), `nA` 0.021, `nB` 0.052;
  `fine = 1-smoothstep(70,300,dist)`. Wave-scale variation = new uniforms
  in `_makeMaterial` + a field on `WaterBasin` (:59-87).
- Shoreline: shader foam :699-732 (`bedSlope` two 1.5 m bed taps,
  `band = min(uFoamBand, max(0.10, 3.5*bedSlope))`, distance fade
  `smoothstep(220,620,dist)` :732) + real swash geometry `water/Shore.ts`
  (21 elevation rows, one merged mesh, `_buildShore` :276) with
  `water/ShoreMaterial.ts` (run-up, three along-shore sine sets 43/71/113 m).
- Judged frames: `zone_galdin` Shots.ts:479, `zone_vesperpool` Shots.ts:557.

**24 · rain** — `src/world/weather/Rain.ts`
- Streaks: `RAIN_VERT` :20-83; three parallax shells `uL0/uL1/uL2`
  :231-233; 92 000 instanced quads :211.
- **Splashes already exist** — `SPLASH_VERT` :104, 1500 instances :254,
  `uExtent 22.0` :262, `uRate 2.4` :264, ground via `tf_height`. Two draw
  calls total.
- **Density is one scalar with per-drop random cull**: `alive = step(pick,
  uIntensity)` :40-41 (drops) and :121-122 (splashes) — no spatial or
  temporal structure. That IS the "identical straight lines" tell. Fix: a
  2-D gust/curtain field on `(pxz, uTime)` multiplying `uIntensity` in
  BOTH shaders + per-drop length/width jitter beyond `fract(aSeed.y*91.7)`
  :64.
- Driver: `src/world/Weather.ts` PRESETS.storm :69, `rain.update` :281,
  per-frame uniforms Rain.update :290-313. Wetness in `weather/Wetness.ts`
  (Weather.ts:287), volume in `weather/VolumePass.ts`.

**25 · probe framings (no Shots.ts edit)** — copy
`src/tools/probes/vegwaterlook.mts` verbatim as the pattern:
`g.applyShot('zone_vannath')` :17 to boot, `rig.setShot({pos,target,fov})`
:109/:143/:162, `g.settle(26)`, `await window.__shot(name)`. Derive poses
LIVE from `w.riverWater.geometry` stations and `w.bodies` waterline walks —
never hard-code coordinates. Maidenwater = WorldMap.ts:680 (−3040,1460,r62),
find it as a Water.bodies entry. Run: `node src/tools/probe.mts
src/tools/probes/<name>.mts --shot tmp/shots/l7/x.jpg`. River sheet floor to
re-judge first: `water/RiverMaterial.ts:227` `alpha = clamp(max(...,
0.34*bodyRamp))`.

**26 · gradePad V-from-height** — `src/world/props/Wear.ts`
- The writer: `:773 uv.push(ct * s, st * s)` — U and V both horizontal
  metres; cliff branch walks `reachOut = 1.6` (:646) while y drops to
  `wall = -min(26, deepest+1.2)` (:711) = 16.25:1 stretch. Fix: cumulative
  3-D arc length — accumulate `hypot(Δs, Δy)` across the ring loop (`for i`
  at :671) and push as V; keep U as along-bearing metres so
  `groundMaterial`'s `repeat = 1/mpt` keeps fixed texel density.
- Update `PropMaterials.ts:144` — it documents the world-metre-UV contract
  by quoting this exact line.
- Only one real caller: `PoiKits.ts:715` inside `_apron` (:709-756) — feeds
  every POI apron. Judged frame: `poi_haven`.

## Mechanism notes
- One `reflectTarget` serves every body; mirror plane picked per frame by
  `_nearestLevel` :912 — per-body wave scale must not break the plane
  assumption. `_visible` :834 frustum-tests slab bounds (:488);
  `_shouldReflect` :848; stride 2 (:163); 384×192 target (:369).
  `_collectReflectRoots` :391 puts ONLY sky dome + terrain clipmap on
  `REFLECT_LAYER = 3` (:56).
- Sky drives water light every frame (~:780-815), mirrored to shoreMat and
  riverMats.

## Commands
- `node src/tools/probe.mts src/tools/probes/<x>.mts --shot tmp/shots/l7/<x>.jpg`
- `node src/tools/shoot.mts zone_galdin zone_vesperpool poi_haven --out tmp/shots/l7 --jpeg`
- **`--cold` capture mandatory after any shader edit** (see landmines).
- `pnpm run check` / `check:perf`; nanscan; `daemon.mts --health` /
  `--wait idle --for <s>` (never poll, never start a server).

## First commits
1. `probes/seawater.mts` + `probes/rainlook.mts` — framings for
   Maidenwater, two rivers, Galdin sea, storm ground close-up. Judge BEFORE
   touching anything (task 25 gates 23/24).
2. Wear.ts:773 arc-length V + PropMaterials.ts:144 doc; re-shoot poi_haven.
3. Wave-scale per-body uniforms in `_makeMaterial`; cold capture.
4. Gust/curtain field on uIntensity in both rain shaders; raise splash
   extent/count; cold capture.

## Landmines
- **A planar reflection that enables layer 0 is a full second scene
  render** — `reflectCam.layers.set(REFLECT_LAYER)` at :380/:879 must stay
  `set`, never `enable`.
- **`'body' : redefinition` killed the river surface for a day, every gate
  green.** `Water.ts` has `vec3 body` at :697. A GLSL compile failure is
  invisible on a warm page — one `--cold` capture after any shader edit;
  only `LINK_STATUS === false` is real.
- No shader locals named `cross`/`patch`; backticks inside `/* glsl */`
  templates terminate the string (foam comment :706-717 says so).
- `WORLD.seaLevel` is not "how high is the water here" (four files have
  had that bug) — ask `Water.mask` / `water/WaterMask.ts`.
- Never hard-code world coordinates in a probe.

## Done-when
Maidenwater/river/sea probe captures exist and were LOOKED at (tarn mottle
and river sheet each closed by a read frame or measured negative);
zone_galdin + zone_vesperpool show depth-graded water, a shoreline band and
more than one wave scale, cold-captured, no link failure; storm shows
non-uniform density + ground splashes; poi_haven wall at ~1:1; check green,
nanscan clean, perf unmoved.
