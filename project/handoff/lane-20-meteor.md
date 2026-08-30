# Lane 20 — The Meteor (cold-start brief)

Owns: `src/world/props/Megastructures.ts` (`_meteor`/`_meteorParts`/
`megaMaterials`); touch `PropMaterials.ts:537 glowMaterial` narrowly.
Not yours: `Shots.ts` (lane 3→21); `lest_overlook_disc`/
`disc_rim_overlook` don't exist yet. Direction chosen by the human:
**glowing wound — molten-blue crystal fissures, visible from the highway
at night.** First cut on overrun (plan §5).

## The recorded story (read before designing)
- Closure: STATUS history "both levers are measured negatives … all 22
  slabs are entombed"; full row:
  `project/archive/plans/2026-08-26-opus-the-standing-backlog.md:1207-1220`;
  lane report `project/archive/handoff/props-r4.md:158-190, 250-259`.
- Negative 1: `tintNorm` on the rock field (b921642, reverted) — a
  uniform ×1.115 albedo lift wearing a normalisation's name.
- Negative 2: fissure glow ×40 (`probes/meteorglow.mts`, 3eef135) — **not
  one lit pixel** in either shot. Cause is geometric: `_meteorParts`
  places clefts at the MIDPOINT of two mass centres
  (Megastructures.ts:1004-1010); masses r 165–300 m at centres 300–360 m
  apart, so every midpoint is inside both bodies. All 22 slabs within
  ±204 m of origin while the stone spans −1154…+1085.
- Negative 3: vertex-seated slab placement, built and reverted — still
  invisible at ×40 (a slab stands ~0.6 m proud; one pixel at 1.7 km is
  1.53 m).
- The priced fix (this task): "glowing veins authored ACROSS THE VISIBLE
  FACES on the cleave-plane edges the mass already has, at tens of
  metres, sized for a 585 m landform."

## Anchors
- Build: `_meteor` :886 (group at meta.x/gy/z, rotation.y 0.6), centre
  (−1020,−2160), gy = seatY − 90 (:907-918); ground() :922-931; six
  masses :938-968; CLEFT :1004-1008; 22 slabs :1011-1024; apron :1030;
  rim ring 46 blocks 790–1060 m :1057-1085.
- Materials: `meteorGlow: glowMaterial(0xff8a2e, 2.2, …)` :317; mesh
  auto-naming `mega_<key>` :375 (geo bake keys on it); night ramp
  `emissiveIntensity = 1.6 + 1.4*night` :1131; night from sun elevation
  Props.ts:198-204.
- meteorMass closed negatives (:177-224): 12 planes, bite 0.60, warp
  0.21, gully 0.34 — do not re-tune.
- Crater: WorldMap.ts:839 discCrater r1080 rim 210 depth 120 core 300;
  shaping Field.ts:1240-1269 (rim gaussian at 864 m, σ184; rim breaches
  at 1.9/4.6 rad in the ring loop).
- Per-vertex emissive to reuse: `GeoKit.ts:260 glow() / :322
  enableVertexEmissive`; same pattern RigBuilder.ts:376-400.
  Containment-test idiom: `_probe/fissure.mts`.
- Bloom threshold 1.45 post-exposure (BloomPass.ts:61, ÷EV :354-357).
- Sightlines (world→local with yaw 0.6: lx = .8253wx − .5646wz, lz =
  .5646wx + .8253wz): `landmark_meteor` (Shots.ts:749, t 17.6, 1400 m S,
  1.45 m/px) sees masses 2203/2206 (+0.56,−0.83 local); `zone_mencemoor`
  (1714 m NE, 1.39–1.53 m/px) sees 2204/2201; **Lestallum (2428 m, west
  face = exactly local −X, 2.18 m/px) sees 2202/2205**; highway spur
  n_disc (−1220,−1360) is 824 m — ON the rim ring, ~0.66 m/px.

## Mechanism (the design)
The entombment cause: the glow is a separate solid placed where the rock
also is. Two layers:
1. **Veins as surface, not objects.** `meteorSkin = stone.clone()`
   patched with enableVertexEmissive; stamp an `aEmissive` vein field
   per-vertex on the six mass geometries (fbm ridge banded to the
   relief step edges, so veins follow cleave arrises). Occlusion becomes
   impossible — the lit vertices ARE the visible surface. One extra draw.
   Width floor: ~7 m triangles, ≥10 px at 2.18 m/px ⇒ **author 20–40 m
   wide**, tapering, a few long branching veins per face on local −X
   (Lestallum), +X/−Z (landmark_meteor), +Z (mencemoor).
2. **Crust fissure mouths.** Repurpose the 22 meteorGlow boxes as a few
   LARGE fissure mouths on the crater crust (40–120 m, seated on
   ground() a few metres proud, biased to the rim breaches at 1.9/4.6
   rad so the rim doesn't occlude them from the spur and Lestallum).
- Colour: molten-blue = core near white-blue, warmer halo (keep 0xff8a2e
  only as the halo). Radiance must clear bloom's 1.45 post-exposure:
  ~2–4 at night, ~0.8–1.2 day.
- **enableVertexEmissive adds vEmissive straight into
  totalEmissiveRadiance — material.emissiveIntensity does NOT scale it.**
  Add a `uGlow` uniform to the patch and drive it beside :1131.

## Commands
```
node src/tools/daemon.mts --health
node src/tools/probe.mts src/tools/probes/meteor.mts --dirty
node src/tools/probe.mts src/tools/probes/meteorglow.mts --dirty --shot tmp/l20/glow.png --set __MG_SHOT=landmark_meteor --set __MG_GAIN=40
node src/tools/shoot.mts landmark_meteor zone_mencemoor --dirty --out tmp/shots/l20-a --jpeg
node src/tools/texbake.mts --geo        # MANDATORY after Megastructures/PropMaterials edits
pnpm run build:full && pnpm run check
```

## First commits
1. **Instrument first:** `probes/discglow.mts` — per emissive element:
   (a) containment in any mass, (b) rays from the three judged stands vs
   the meteor meshes, (c) lit-pixel count at gain 1 per shot. The ×40
   control stays the arbiter: invisible at ×40 = geometry, not
   brightness.
2. meteorSkin + aEmissive veins on the three judged faces + uGlow night
   uniform.
3. Re-place the 22 slabs as crust fissure mouths near the rim breaches;
   **delete the CLEFT midpoint placement outright** (it has never
   rendered).
4. texbake --geo; before/after crops with a control box; keep this file
   current.

## Landmines
- `Megastructures.update:1119-1133` rewrites emissiveIntensity every
  frame — settle first (this cost the glow probe a whole run).
- PartBuilder synthesises only a missing `color`, not aEmissive
  (:100-106) — an aEmissive mass in the shared M.stone batch breaks the
  merge; the separate material key is mandatory.
- Megastructures.ts + PropMaterials.ts are in GEO_SOURCES — editing
  deletes geo.bin.gz for every lane until re-baked. Announce.
- Group origin is sunk 90 m — use ground(lx,lz,size) + MASS_FOLLOW 0.35
  or new geometry floats/buries (the invisible-apron-shards bug).
- Whole-frame imgdiff can't see this: landmark_meteor cold floor 1.238
  but warm-to-warm noise 5.37 (LANDMINES.md:680-707). Box-on-change +
  control box + repeat.
- landmark_meteor has period-2 draw parity — poses must resetClock().
- landmark_meteor runs t 17.6 — verify `night` there before claiming a
  night read; a true night frame needs a shot this lane does not own.

## Done-when
Blind A/B of landmark_meteor hesitates in the next judged round. Lane
exits before that: **>0 lit pixels at gain 1** from landmark_meteor,
zone_mencemoor AND a Lestallum-stand probe capture; vein width ≥10 px at
the worst range; before/after crops read by eye; check + nanscan green;
texbake --geo re-run. Otherwise the lane closes with a measured negative
into HUMAN_REVIEW.md and the decision returns to the human.
