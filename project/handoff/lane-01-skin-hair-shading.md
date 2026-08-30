# Lane 1 — Skin and hair shading (cold-start brief)

Owns: **all of `src/characters/rig/`** — Materials.ts, Face.ts, Hair.ts,
Geo.ts, Character.ts, Sculpt.ts. (The plan's lane 2 split double-claimed
rig/Materials/Geo/Character — resolved: lane 1 takes rig/ entirely; lane 2
= `src/characters/` outside rig/ plus rig/Outfit.ts and rig/Look.ts.) The
one `src/characters/Cast.ts` hair-colour change lands as its own
explicit-pathspec commit (lane 2 also edits Cast.ts:193).

## Anchors per task

**T1 winding — root cause is two shared builders, not per-mesh.**
- `Geo.ts:391 sweepTube`: ring frame `_r.crossVectors(_f, tan)` :419;
  body quads `:456 B.quad(A[j], A[j2], C[j2], C[j])` — with the
  right-handed basis, geometric normal = −outward → **every sweepTube is
  inward-wound**. `Sculpt.ts:266-270` states this exact rule for the
  creature builder and uses the reversed order. Caps follow the tube
  (:500,:504,:555,:559) — all inward, self-consistent.
- `Geo.ts:843 blob` quad order = −outward → inward too.
- `Face.ts:1404 buildEyes` sphere quad, same order → **both eye globes
  inward — explains "both eyes negative"**.
- Correct references to copy: `Geo.ts:934 ribbon` (comment :925-933),
  `Face.ts:954 buildHead` grid, `:967` chin cap, `:1263-1264 buildLid`,
  `Hair.ts:222-228 emitCard`.
- **Safe flip = swap quad argument order (`quad(a,b,c,d)` → `quad(a,d,c,b)`)
  at each site, NOT negating `_r`** (that mirrors asymmetric shapes).
  `Geo.ts:587-598`: inner shell stays relative; rim/cap quads must flip
  with the tube. Normals derive from the index buffer
  (`computeSmoothNormals` :262) — they flip automatically.
- Bodies: `Body.ts:41,48,63,90,112,307,409,444` (sweepTube) + `:100`
  (blob). Skin is FrontSide (`Character.ts:157-158`); hair is DoubleSide
  (`Materials.ts:804`) and is masking its own winding.
- **Eye meshes are unnamed**: `Character.ts:195-217`, mesh at :209 —
  set `eyeMesh.name = \`${this.name}_eye${sg>0?'L':'R'}\``.

**T2 subsurface.** The sss block is `Materials.ts:189-240`, injected
after `<opaque_fragment>` (:423-428): terminator :207, back-scatter :210
(`pow(dot(sV,-sL),3.0) * (0.12 + 1.15*thick)`), wrap :227-228, fresnel
:236. **A wrap term already exists — the missing cue is THICKNESS.**
`vMat.z` is the channel: `Face.ts:895-905 thicknessAt` (ear 1.0, nose
0.85, lip 0.7); the ear plate `Face.ts:1014 B.mat(0.46, 0, 0.5)`. **The
body writes thickness 0 everywhere** (`Body.ts:33,107 B.mat(0.57, 0)`,
`:487`), so `back` collapses to its 0.12 floor. Amounts: skin sss 0.155
(:739), face sss 0.16 (:757), `SSS_RED = 0xb8503a` (:718). Add the
thickness-tinted rim INSIDE the same block (pow(1−NdV,k) · thick ·
dot(V,−L)), not a new pass.

**T3 skin detail scale.** `Materials.ts:630-704 cache()` — PORE 256,
three octaves, `normalFromHeight(...,1.9)` :650-654. **The scratch is
anisotropic tiling**: `pore.repeat.set(15, 23)` (:655) body and
`poreFine.repeat.set(9, 13)` (:658) face — 1:1.53 / 1:1.44, a round pore
stretches into a streak. Strengths: normalScale 0.30 body (:731) / 0.34
face (:751). `maxFreq` (:628) is the Nyquist floor — don't exceed it.

**T4 hair aniso + coverageAA.** Aniso block ALREADY EXISTS:
`Materials.ts:242-331` (tilted macro normals :279-280, Kajiya-Kay
:288-290, rim :315-321, sky dome :327-328); params at :808
`{spec:0.55, shift:0.30, exp1:110, exp2:20, tint:0.85}` — tune, don't
build. coverageAA at `:798-799` (alphaMap + alphaTest 0.35): shader-side
alphaTest rescale by `fwidth(alpha)` (patch `<alphatest_fragment>` in the
same onBeforeCompile) + alphaToCoverage; the shadow depth material copies
map/alphaMap/alphaTest (:794-797) — anything done as a define must
survive there. `hairCut` generation :504-608 (mean coverage ~0.62 by
design); CARD_VARIANTS 4 (:445); cards emitted `Hair.ts:647-675`.

**T5 near-white blond — hypotheses ranked.** The straw fix (:300-309)
only luminance-normalises the SPECULAR tint; it does nothing to albedo.
1. **Authored albedo is near-white at the tips**: Prompto tipColor
   0xf4e2bd ≈ 0.77 linear luma; `emitCard` ramps `c.lerp(tipColor, t*t)`
   (`Hair.ts:212`) with card tips seeded at `tTip * (0.66-0.96)`
   (:668-670) — a t² ramp to a 0.77-linear tip IS white before light
   touches it. Check first.
2. **Env IBL**: hairMaterial sets no envMapIntensity → 1.0 while
   eyeMaterial clamps to 0.20 (:824); `Sky.ts:1228-1229` assigns the sky
   cube at full intensity. Ablate `--ablate noenv`.
3. Light rig: `Materials.ts:48` clamps the PATCHED terms' sun; three's
   own BRDF is unclamped — clipping is three's.
Order: `regionstat` the hair rect on PNG hero_full → `--ablate noenv` →
zero `spec` at :808 temporarily → drop tipColor.

**T6 face brushes.** `brushes()` `Face.ts:127`; constants :203-268
("authored while backface-culled, softened 30-50%" note :196-205).
`paintFace` :1605; occlusion section :1740; AO damp `a * 0.52` :1771 —
**setting AO to 0 changed hero_portrait by NOTHING (:1750-1770): the
slashes are the SCULPT's grooves, not the paint.** T6 is a brushes() job,
judged with `probes/facefront_flat.mts`, not a paint job.

## Mechanism notes
- One `patch()` (:125-432) serves every character material; `kind` :140
  drives `customProgramCacheKey` :430 — new per-material variation must
  fold into the key or programs alias.
- Varyings cost every program that declares them — put new SSS data in
  vMat's unused headroom, not a new varying.
- Everything injected after `<opaque_fragment>` = linear HDR;
  `totalEmissiveRadiance` writes there are a NO-OP — write
  `gl_FragColor.rgb`.

## Commands
```
node src/tools/probe.mts src/tools/probes/facewind.mts --dirty
# other three heroes: iterate g.get('Party').members instead of Player
node src/tools/shoot.mts hero_portrait hero_profile hero_full --dirty --jpeg --out tmp/shots/lane1-before
node src/tools/shoot.mts hero_full --dirty --cold --raw --ablate noenv --out tmp/shots/lane1-noenv
node src/tools/regionstat.mts tmp/shots/lane1-before/hero_full.png <x0> <y0> <x1> <y1> --label hair   # PNG only
node src/tools/facecheck.mts --dirty --shots tmp/shots/facecheck
node src/tools/probe.mts src/tools/probes/facefront_flat.mts --dirty --shot tmp/shots/brushes.jpg
node src/tools/probe.mts src/tools/probes/nanscan.mts --dirty          # after ANY shader edit
node src/tools/shoot.mts hero_portrait --dirty --cold                  # only oracle for a GLSL link failure
node src/tools/gitlock.mts commit -m "..." -- src/characters/rig/Geo.ts
```

## First commits
1. Geo.ts sweepTube/blob winding + Face.ts:1404 eye winding +
   Character.ts:209 eye names — ONE commit, facewind before/after in the
   message, all four heroes. **Nothing else lands until winding is
   green** — wrong normals corrupt every downstream measurement.
2. Re-capture + re-baseline the three hero shots.
3. Body thickness (Body.ts B.mat third arg) + SSS transmission rim.
4. Pore tiling :655/:658 + normalScale :731/:751.
5. coverageAA :798-799; aniso params :808.
6. Cast.ts hair tipColor (explicit pathspec — lane 2 shares the file).
7. Face.ts brushes re-derivation.

## Landmines
- **A uniformly-inversely-wound shell is invisible to every bench**
  (LANDMINES.md:1529-1568) — only facewind is orientation-absolute.
- **DoubleSide hides winding** — hair still is (:804).
- **A GLSL link failure is invisible on a warm page** — one --cold
  capture after every shader edit; LINK_STATUS===false is the only real
  signal.
- Black blob = possible NaN; in-shader NaN tests fold away — nanscan
  after anything touching a shader; clamp every pow() base with a varying
  input (:289 already guards; keep the discipline).
- Don't ablate lights via `visible` (43-program recompile, 9.5 s).
- **The corpus closeups are not closeups** (hero_face is ~100 px of
  head) — judge at 0.4-0.6 m via framecam/facecheck; absolute framings
  drift — use follow shots.
- The tutorial hint card parks over the forehead in face framings:
  `g.get('HUD').hints.root.remove()`.
- facecheck currently VOIDs and PASSes — lane 16 makes VOID a failure;
  don't read a VOID row as green.

## Done-when
facewind on all four heroes: positive signed volume on body/hair/outfit
and both NAMED eye meshes, ≥95% front tris +z — or the negative explained
here with the geometry that causes it. hero_profile: backlit ear reads
red-warm (regionstat R−B delta ear vs cheek). hero_portrait: pores not
scratches, no directional streaking. Hair edges anti-aliased with a
visible aniso band; shadow behaviour unchanged. Blond closed with a named
cause + regionstat p50/p99 no longer near-white. facecheck green with
lane 16's VOID fix. check green, nanscan 0, one --cold link proof, draws
unmoved.
