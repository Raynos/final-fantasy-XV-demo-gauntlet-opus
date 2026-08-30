# Lane 2 — Costume (cold-start brief)

Owns: `src/characters/**` except `rig/Face.ts` and `rig/Hair.ts`. Primary:
`rig/Outfit.ts` (930 ln), `Cast.ts` (562 ln), `rig/Materials.ts` (garment
material only — lane 1 owns the rest of Materials; coordinate), `rig/Look.ts`
(`OutfitPiece` fields). Do NOT touch `Shots.ts` (lane 3).

## Anchors per task

**7 — cloth folds** (`hero_full`: "flat-shaded clothing")
- `Outfit.ts:130-195` `clothShade()` — the only per-vertex shading source:
  `seam`, `wear`, `color`, `mat` ([rough, metal, 0] at :194).
- Fold geometry lives only in each piece's `shape` fn: shirt :174-193,
  jacket :277-321, sleeve :604-616, pants :641-655. Amplitudes `o.wrinkle`
  (Noctis jacket 0.036, shirt 0.020, Cast.ts:193-204). Ring/step counts:
  shirt 42×76 authored, jacket 26×38 (:271), sleeve 18×22, pants 26×22.
- Normals from positions only — `Geo.ts:262` computeSmoothNormals, welded
  by `B.group(g++)` at Outfit.ts:143. No normal-perturbation term anywhere
  in the cloth path.
- Shader: `Materials.ts:122-192 patch()`; only fragment hooks are
  `roughnessmap_fragment` (:182) and `metalnessmap_fragment` (:184).
  Garment material :761-781: `normalMap: c.weave` at normalScale 0.62,
  repeat 9×14 (:672) × per-piece uvScale — thread-scale only, nothing at
  fold scale.
- **Two free per-vertex channels**: `vMat.z` (thickness) is 0 on every
  garment vertex, and `aTan` is the untouched +Y default — Outfit.ts never
  calls `B.thick()`/`B.tang()` (only Hair.ts/Geo.ts:917,940 do).
  `MeshBuilder.mat/tang/thick` at Geo.ts:148-165. A fold/AO/anisotropy
  term rides one of these into patch() without a new attribute.

**8 — print resolution (verified bug)**
- Cast.ts:193 authors `steps: 42, seg: 76`; Outfit.ts:238 ignores them:
  `steps: o.printSteps ?? 56, seg: o.printSeg ?? 64`. One-line fix at :238 —
  derive fallbacks from the shirt, e.g.
  `steps: o.printSteps ?? Math.max(56, Math.ceil((o.steps ?? 20) * (tb - ta) * 4)),
   seg: o.printSeg ?? Math.max(64, Math.ceil((o.seg ?? 32) * ((th1 - th0) / (Math.PI*2)) * 4))`
  (`ta/tb/th0/th1` in scope at :222). Fields exist: Look.ts:296-297.
- Window `printWindow [-0.60,0.60,0.44,0.94]` (Cast.ts:193), `printLift
  0.0016` tapered at :229-233 — don't re-introduce a hard border step.

**9 — triangular skin hole at Noctis's collar**
- Collar builder Outfit.ts:518-548, called :337. **Root cause found:**
  `:521 const gap = o.collarGap ?? (o.gap ?? 0.42) * 0.8;` — Noctis
  (Cast.ts:195) sets `gap: 0.58` and no `collarGap`, so the collar sweeps
  [0.464, 2π−0.464] while the jacket body sweeps [0.58, 2π−0.58] (:272):
  the collar overhangs the jacket's front edge by 0.116 rad per side with
  nothing under it — that wedge is the triangle. Same mismatch on gladio
  (0.34 vs 0.60·0.8? — Cast.ts:349), prompto (Cast.ts:537), ignis
  (Cast.ts:436).
- Rule out with the same crop: shirt neckline scoop :177-178 vs collar base
  `y0 = o.collarY ?? 1.418` (:525). Torso tops at y 1.478 (Anatomy.ts:70);
  neck skin tube Body.ts:63-81. DoubleSide is on (Character.ts:53) — it is
  a real gap, not culling.
- Prior sighting: `project/archive/handoff/ws7-hands-outfits.md:193-195`.

**10 — Ignis value separation at 4 m+**
- Cast.ts:433-444: every garment constant within 8.6/255 of luma —
  jacket/skirt/sleeve 0x25242c (Y≈37), boots 0x2b2827 (41), pants 0x2e2b2c
  (44), shirt 0x2e2c2c (44), belt 0x2e2c38 (45).
- Structural half: `sleeve u1: 0.92` (Cast.ts:438) + full gloves
  (Cast.ts:401) = zero skin below the jaw. Compare Noctis `sleeve u1: 0.34`
  (Cast.ts:202) and shirt 0x3a3a3c (58) vs jacket 0x2c2a29 (42).
- Levers by cheapness: shirt/jacket value split; rough split (both 0.62);
  collarColor/cuffColor/weltColor accents (Look.ts:262-276); then sleeve u1.
- Formation: Ignis slot [1.85,−1.45] (Party.ts:127); party_formation cam
  offset [5.02,3.6,5.16] fov 42 (Shots.ts:296).

## Mechanism notes
- ONE garmentMaterial is shared by all four heroes (Character.ts:43-58) and
  a second by every NPC (npc/NpcRig.ts:10). `customProgramCacheKey` is
  `char2-${kind}` (Materials.ts:430); garments are the only kind==='plain'
  — a garment-only shader branch needs its own kind or it silently shares.
- `shadowSide = BackSide` (Character.ts:56): geometry folds cast into the
  shadow map; a fragment-only fold term will not.
- Wrinkle args are radians over the whole parameter: `sin(th*7 + t*16)` is
  2.5 cycles along t (pants comment :646-652 is the precedent, 4
  samples/cycle min). Current pieces are above that — undersampling is NOT
  the flat-shading cause.
- Recorded negative: three sleeve-as-surface attempts (TASKS.md:91). If
  task 7 fails again as shading, that negative closes it (plan rule 2).

## Commands
```
node src/tools/shoot.mts hero_full hero_face party_formation --out tmp/shots/lane2-r0 --jpeg
node src/tools/shoot.mts hero_full hero_face party_formation --out tmp/shots/lane2-r0p     # PNG for crop/imgdiff
node src/tools/crop.mts tmp/shots/lane2-r0p/hero_full.png tmp/shots/lane2-r0p/c_torso.png 680 210 300 340 3
node src/tools/crop.mts tmp/shots/lane2-r0p/hero_face.png tmp/shots/lane2-r0p/c_collar.png 620 280 340 320 3
node src/tools/crop.mts tmp/shots/lane2-r0p/party_formation.png tmp/shots/lane2-r0p/c_ignis.png 900 300 340 420 2
node src/tools/regionstat.mts tmp/shots/lane2-r0p/party_formation.png 0.56 0.33 0.78 0.80 --label ignis
node src/tools/lineup.mts tmp/shots/lane2-r0p/_four.png 620,60,380,800,2 <four PNGs>
node src/tools/framecam.mts tmp/lane2/collar.json --out tmp/shots/lane2-collar
node src/tools/geocheck.mts && pnpm run check
```
Read the JPEG crops, not the full frame; keep the same rects across rounds.

## First commits
1. Outfit.ts:238 — forward authored steps/seg into printPatch. One line.
2. Outfit.ts:521 — collarGap default becomes `o.gap ?? 0.42` (never
   narrower than the jacket opening); hero_face before/after.
3. Cast.ts:434,436,438 — Ignis value split ≥12/255 + one accent.
4. Only then task 7: a fold term on vMat.z from clothShade read in patch()
   with a new kind, or a fold-scale detail normal.

## Landmines
- Captures default `--build HEAD` — uncommitted edits are not in the frame;
  `--dirty` for the tight loop.
- Explicit pathspec commits only (shared index; hook blocks -am/-A).
- Shots.ts is lane 3's — new framings via framecam/dresscam.
- Any garment-material change hits the whole NPC cast + draw/perf gates.
- The collar sits beside the jaw — don't "fix" it in Body.ts's neck without
  checking lane 1's winding work first.
- imgdiff floor ~1.5/255; single-shot draw deltas under ~20 are noise.
- `_probe/hands.mts` `_palm*` framings are too tight — don't trust them.

## Done-when
8: print border invisible, mark legible at hero_face; raising Cast.ts:193
steps/seg visibly changes the print. 9: no skin between collar and jacket
on any hero at the crop; geocheck green. 10: regionstat ≥12/255 between
Ignis's two largest garment regions; lineup separates him from
gladio/prompto. 7: fold shading visible in the torso crop — or a written
measured negative. Gates green throughout.
