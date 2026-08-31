# Landmines

Every entry here cost real time once, and none were obvious. This is the durable
record — it outlives the agent, the branch and the handoff that found it.

**Genre:** append when something is *proven* and non-obvious; delete when the
cause is gone from the code. Not a bug tracker (open work goes to
`docs/plans/` or `TODO.md`) and not a changelog (that is the git log). If you can
find it by reading the code in two minutes, it does not belong here.

Consolidated 2026-08-22 from `RESCUE.md` §C, `PROGRESS.md` §10, `HANDOFF.md` §5
and the gotchas sections of eight agent handoffs, with the wrong ones corrected —
see **Diagnoses that were wrong** at the end, which is the most useful section
in this file.

---

## Engine and rendering

- **`Game.get()` on `constructor.name` returns `undefined` in production.** The
  minifier mangles class names. Registration is by **explicit key**; do not
  "simplify" it back. It worked in dev for weeks because the harness only ever
  tested dev — hence `shoot.mts --prod`.
- **Toggling a light's `visible` changes the program key** and recompiled 43
  programs: a measured **9.5 s freeze**. `engine/LightBudget.ts` pins the counts.
- **`GTAOPass` sets `scene.overrideMaterial`, which discards alpha-test**, so
  foliage stamps solid black rectangles into the AO buffer.
- **A solid black blob in a frame can be a NaN, and the grade is what makes it
  black.** The Nebulawood canopy's blob was `normalize()` of the zero vector in
  the terrain's triplanar normal blend. Nothing on the canvas can tell you that:
  8-bit output has no NaN, only 0,0,0. **Read `post.rtScene` — the linear HDR
  scene target — with `readRenderTargetPixels` and count the NaNs.** It is
  `HalfFloatType`, so decode `Uint16Array` yourself; exponent 31 with a non-zero
  mantissa. `src/tools/probes/nanscan.mts` does it for all 142 shots. It found
  **seven** carrying NaN from two unrelated causes, and the corpus is at **zero**
  now; run it after anything that touches a shader. No gate catches this: a NaN is not a page error, does not
  move a draw count, and against a baseline holding the same hole it is not even
  a pixel diff.
- **Every in-shader NaN test is folded away by the shader compiler here.**
  `isnan()`, `isinf()` and the `(x >= 0.0 || x < 0.0)` idiom all answer *false*
  for a NaN on this backend. Six sanitisers at six points of the terrain
  fragment shader moved the NaN count by **zero pixels** and read as innocence;
  so did "the normal is not below the horizon / not denormalised / not
  backfacing", which were all NaN answering `false` to a comparison. Test the
  bits: `(floatBitsToUint(v) & 0x7f800000u) == 0x7f800000u && (v_bits &
  0x007fffffu) != 0u`. That cannot be folded, and it named the line in one run.
- **A debug flag written through `totalEmissiveRadiance` is invisible on a NaN
  pixel** — it is *added* to a term that is already NaN, so the flagged pixel
  comes back NaN. Write the flag over `gl_FragColor` at `<dithering_fragment>`.
  And `outgoingLight` is summed in `meshphysical_frag` **before** `#include
  <opaque_fragment>`, so anything written to `totalEmissiveRadiance` at that
  anchor is already too late and silently does nothing.
- **`pow(x, y)` is undefined for `x < 0` and this backend returns NaN.** A trail
  ribbon interpolates its own `vUv.x` a hair below zero along its tail edge, and
  `TRAIL_FRAG` used it as the base of two `pow()` calls — a thin diagonal line of
  black on every combat and warp shot that draws a trail, 15-50 px each, five
  shots. **Clamp the base of every `pow()` whose input is a varying**; the rest
  of that shader already did. Same class as the `normalize()` of a zero vector
  above: an operation that is undefined on its input, on hardware that answers
  NaN rather than something harmless.
- **A hide-walk of the scene graph must hide AFTER the pose, and on a VFX group
  it must hide by MATERIAL.** `applyShot` rebuilds subtrees — `VFX` above all —
  so hiding a child and *then* posing hands the pose a fresh set of children
  with the hide undone: every child alibis while hiding the group still works,
  and the walk blames the group and names nothing. And the VFX systems spawn new
  children every frame, so even an object hidden after the pose has been
  replaced by the time the next frame draws. Materials are pooled, so
  `colorWrite = false` on one reaches the objects created after the ablation —
  that took "no single child removes it" to `trail0` out of 41 materials in one
  run. `src/tools/probes/nanwalk.mts` does it this way and says why.
- **`0.0 * NaN` is NaN, so a zero blend weight does not contain a bad value.**
  `mix(planarN, rockN, 0.0)` carried the terrain's NaN rock normal onto ground
  that has no rock in it at all — which is why the defect appeared on a forest
  floor and not on a cliff.
- **GTAO reconstructs its normals from depth** when `setGBuffer` is handed a
  depth texture alone (`NORMAL_VECTOR_TYPE = 0`). It then draws the raw triangle
  facets of every distant massif as a regular herringbone — see the chevron entry
  below. `patchGBufferMaterial` exists for the normal path and is simply not fed.
- **A planar water reflection that enables layer 0 is a full second scene
  render.** It was documented as "sky + terrain only"; it was not.
- **`setHex(tint, SRGBColorSpace)` returns a *linear* colour**, which then gets
  written into an sRGB-tagged texture and de-gamma'd twice. Every prop was ~10×
  too dark; Magitek hulls rendered flat black.
- **`HTMLCanvasElement` texture upload loses alpha** in this renderer path.
- **`scene.overrideMaterial` debug views are useless for terrain** — `view
  normals` and `view unlit` replace the material outright, so the clipmap renders
  as an undisplaced flat plane. Bisect by editing `tf_shade`'s outputs instead.
- **Bisect the post chain before the shader.** `?post=plain` takes thirty seconds
  and would have saved two agents a round each on the chevron hatch.
- **A screen-space ray march needs a screen-space step budget.** `ContactShadowPass`
  marched a *world* length (0.5 m over 12 steps) with a per-pixel start jitter
  meant to dither within one step. At `hero_portrait` the subject is 0.6 m away
  and one step is **69 px**, so neighbouring pixels started on completely
  different geometry and the binary hit/no-hit landed as a one-pixel
  checkerboard — the "burlap weave on all skin" that a blind judge read as
  plastic skin, and that three lanes hunted in the *material*. Skin was never
  special: it is the nearest large surface in a portrait, and the same march
  over the terrain behind it steps a fraction of a pixel. `post.contact.stepPx`
  caps it. **Any new post pass that walks the depth buffer needs the same cap.**
- **...and capping a march silently invalidates every constant that was authored
  against its length.** The cap above traded the crosshatch for a lobed,
  stair-stepped blob over the whole mid-face and neck — the loudest thing in the
  worst-judged frame in the game for a round. Nothing was wrong with the cap.
  `ContactShadowPass.thickness` = 0.45 m is not an independent number: it was
  chosen against `length` = 0.50 m, i.e. "an occluder about as deep as the
  distance I am willing to walk", and the cap cut the march to 0.045 m at
  portrait range and left the window at **10x** it, so `diff < thick` stopped
  rejecting anything and every ray that dipped behind the face reported a hit.
  `thicknessTrack` scales the window by exactly the ratio the cap applied.
  **When you clamp a length, go and find everything that was expressed as a
  ratio of it.**
- **The shape of an artefact is bad evidence about its cause.** That blob was
  lobed and stair-stepped, which reads unmistakably as quantisation — `occ` can
  only take 13 values with `CS_STEPS = 12`. It is not: hold the reach fixed and
  treble the step count and the blob is identical. It was a *binary* region of
  full occlusion with a jagged boundary, and jaggedness is what a hard threshold
  on a smooth field looks like. Ablate the threshold, not the sampling.

## Terrain

- **`surfArray` carries no normal Z.** It is `rg = tangent normal xy, b =
  roughness, a = AO` (`Layers.ts` line 9), so every reader has to rebuild Z —
  and a reader that takes `.b` for it is reading the roughness. The triplanar
  rock block did exactly that, and its neutral fill `vec4(0.5)` then decoded to
  the **zero vector** rather than to a flat tangent normal `(0, 0, 1)`; the
  whiteout blend of three of those is zero on axis-aligned ground, and
  `normalize` of zero is NaN. That was the black blob on the Nebulawood canopy,
  and it also had a smaller twin in `zone_malmalam`. `tf_tanN` is the one place
  the reconstruction lives now; use it.
- **The chevron hatch on conical peaks is GTAO**, not the heightfield and not the
  splat. Bisected, not guessed: constant albedo → unchanged; constant up-normal
  with AO forced to 1 → unchanged; **`?post=nogtao` alone → gone completely.**
  Half of it genuinely was ours — the clipmap vertex shader point-sampled the 4 m
  heightfield at a 12–96 m vertex pitch, which is decimation, not filtering —
  and `tf_heightLod` now low-passes by the level's own cell. The residual facets
  are GTAO's and cannot be fixed from `world/terrain/**`.
- **The horizontal "wood grain" on Taelpar's walls was the rock *tile*, not the
  strata** — diagnosed as the analytic strata twice and wrong both times.
  `Layers.ts` recipe 3 drove `hueSel` off a pure sinusoid of world Y at two
  cycles per 12.2 m tile, warped by 0.6 m, so every bed ran dead level across a
  whole hillside. **Fixed, and the recipe's own comments carry the history** —
  the entry survives only because a *third* agent (2026-08-24) saw banding on a
  pale slope at 3x and reached for this diagnosis before reading the code.
  Whatever broad swirls remain on the Longwythe slopes are none of the three
  causes already ruled out here. Ablate.
- **Dark near-ground in green zones is vegetation density plus cloud shadow**,
  not the palette. The pre-change baseline has an identically dark foreground.
  **Shoot the baseline before believing any regression in this shader.**
- **The zone blend dilutes small zones** — Ravatogh holds only ~78% of its own
  weight at its own centre. Measure what actually arrives via `surfaceAt()`
  before authoring a table entry.
- **Zone centres are `cx`/`cz`, not `x`/`z`.** Reading `zn.x` silently yields
  `undefined` and a full table of `NaN`.
- **Coordinates go stale.** Shots framed against world anchors broke twice when
  the terrain was reshaped and again when the world grew 3 km → 8 km. Derive
  coordinates live from `WorldMap`/`Terrain`; never hard-code and hope.

## Vegetation

- **Do not consume `#include <project_vertex>`** in `VegMaterial.patchVeg`. Eat
  it and every leaf and grass card computes eye distance as
  `length(cameraPosition)`, flooding all vegetation over a kilometre from
  Hammerhead to 100% sky inscatter — flat blue-white cards over brown ground.
  **Check `vista_noon` and `zone_three_valleys` after any shader edit there.**
- **A shader local may not be called `cross` or `patch`** — both reserved, both
  failing at *link* time behind the useless `Shader Error 1282 -
  VALIDATE_STATUS false`. Cost two full rounds.
- **Backticks inside a `/* glsl */` template literal terminate the string.** Two
  parse errors from writing a reserved word in a shader comment.
- **`shoot.mts --no-daemon` does not surface shader errors; the daemon path
  does.** `shoot.mts` prints only `e.split('\n')[0]`, throwing away the shader
  source and the actual GLSL diagnostic. The daemon's `/shots` response carries
  the whole string.
- **three.js has no per-instance normal matrix** — it divides the object normal
  by each instance-matrix column length, so non-uniform instance scale flattens
  normals. That was the "green cardboard" grass.
  **Qualified 2026-08-24, because as written it deters a lever that is free.**
  Read the chunk: `defaultnormal_vertex.glsl.js:32-34` is
  `n /= vec3(dot(im0,im0), dot(im1,im1), dot(im2,im2)); n = im * n`, and for
  `im = R·S` with `S` **diagonal** that evaluates to `R·S⁻¹·n`, which *is* the
  exact inverse-transpose. So per-instance non-uniform scale on a rigid mesh is
  correct, not an approximation — `Rocks._item` has relied on it for months at a
  mean anisotropy of 1.7 and its normals are right. What the entry is really
  about is **shear**, and about scale baked into a card's own geometry, which is
  what the grass had. Say which of the three you mean before quoting it.
- **Do not use a per-instance hash for per-clump wind.** An instance in the blade
  ring is *one blade*, not one plant; a positional hash gives blades inside a
  tuft different phases and shreds the tuft. Use smooth functions of world
  position instead.
- **The vegetation shader's comment blocks are load-bearing** — `specular: 0` on
  the card rings, the `twoSidedNormals` flip and the per-instance normal-matrix
  note in `bladeGeometry` are each a documented bug fix.
- **`Trees.composeTint` caches on the identity of the biome's `treeTint` array.**
  Safe only because `VEG_BIOME` holds module-level literals that are never
  blended per position. Make `vegAt` return a blended recipe and this cache
  silently serves the first blend to the whole world.
- **Vegetation once used a road the terrain never carved** — `Ecology` probed for
  `terrain.roadCenterX` and silently fell back.
- **A coarse density lattice cannot see a narrow feature, and the interpolation
  puts the plants back.** `GrassField._makeTile` samples `grassDensity` on a 6x6
  grid per tile and bilerps it: **2 m pitch on the blade ring, 4 on the clump
  ring, 8 on the far one.** Any *hard* 0/1 predicate narrower than that pitch —
  a river at a mean 5.5 m wide, a footpath, a wall — is read as dry at both ends
  of the cell it crosses and the bilerp fills it back in. Measured: 1 251 blades
  standing in one reach and 7 000 in one tarn, with a sampler that correctly
  returned zero at every one of its own sample points. Soft ramps (the road
  corridor's `smoothstep(rd, 2.4, 10.5)`) survive the lattice; step functions do
  not. If the predicate must be hard, ask it **per instance** —
  `Ecology.standsInWater` is the pattern, and it costs one hash lookup per tuft
  because it gates twelve blades, not one.
- **`WORLD.seaLevel` is not the answer to "how high is the water here", and
  `Ecology` was the fourth file to assume it was.** `Tarns.ts` carries the
  running table — `Water._findTarns`, `Fishing._survey`, `rasterChart`, and then
  `Ecology.waterDepth`, which had every population's water test reading −190 m
  on a reach at +180 and grew grass, scrub and trees straight up through every
  river and tarn in the world (95.8% / 77.4% / 41.2% of the drawn sheet). Ask
  `Water.mask` (`water/WaterMask.ts`). And when you mask against water, derive
  the mask from the **drawn** geometry rather than re-deriving the hydrology:
  `emitWater` ramps the sheet's outer 38% down onto the bed, so a mask built on
  `wsl` strips a bald ring of plants along every bank in the band where the
  water is drawn transparent.

## Characters and faces

- **`DoubleSide` on the face material hid backwards winding in three separate
  parts, and covered every eye in the game.** A back-facing surface renders in
  front of the eyeball and hides it completely — which is the "doll eyes /
  painted-on features / mannequin mask" a blind judge named in *every* round,
  while a full eye assembly (sclera, iris, pupil, limbal ring, catchlight, lash
  line, lid crease) sat underneath having never been visible in a shipped frame.
  **The fix is `FrontSide`**, plus the three parts `DoubleSide` was hiding:
  `buildLid` switched winding on `upper === (sg > 0)` when only `sg` may switch
  it (48 of 48 covering triangles below the eye centre), `ribbon()` in `Geo.ts`
  (ear ridges, lash fans) and `buildHead`'s chin cap.
  **This entry used to prescribe widening the socket brushes toward
  `[0.048, 0.032, 0.058]` with `pow: 1.6`. That is wrong and cost a lane most of
  a session**: measured, it cut the covering area 831 mm² -> 265 mm² and changed
  the rendered frame by *nothing*; widening further made it 250 mm² and still
  changed nothing; the brow ridge, under-brow hollow and nasion moved it 3% and
  changed nothing. The fold was never the carrier.
- **Do not "simplify" `skinSnap()` away.** Without it any socket change re-opens
  the lid-band bucket.
- **The corpus closeups are not closeups.** `hero_face` puts Noctis' head at
  ~100 px; no defect in this section is visible in it and no fix is either.
  **Judge face work through `src/tools/framecam.mts` at 0.4–0.6 m.**
- **Absolute `pos`/`target` framings drift** in `framecam.mts` — it settles the
  sim between captures, so by the 13th spec the subject was gone from frame. Use
  `follow` shots; the rig re-anchors on the live root every frame.
- **The tutorial hint card parks itself over the subject's forehead** in every
  face framing. `g.get('HUD').hints.root.remove()`. It is not the HUD and
  `shot.hud` does not suppress it.
- **Never `-=` on an idle layer.** `Anim.ts` once accumulated `bobY` unbounded
  and sank the entire party ~10 m over a long session. The combat stance uses a
  separate `stanceDrop` field combined in `apply()` for exactly this reason; the
  warning comment at that site must stay.
- **Face features vanished at distance** for want of a contrast-preserving mip
  chain — sclera at the same albedo as the socket, so everyone read as squinting.
- **`weaponIK` picks the arm by sign, and the rig's right side is −X.** A
  positive-x hand anchor puts the sword in the left hand.

## Enemies

- **`Color.setHex` runs `Math.floor`, so passing a `THREE.Color` where a hex is
  expected yields `NaN` and renders black, silently, with no error.** This shipped
  in four species at once behind write-ups that said "verified by eye".
- **Two module-level scratch registers cannot survive nesting.** JS evaluates
  arguments left to right, so in `mix(mix(A,B,s), mix(C,D,u), t)` the second
  inner call overwrites the register the first returned and the outer call blends
  a colour with itself. A type guard alone does not fix this.
- **Strided vertex sampling lies about depth** — under-reported by 0.33 m on a
  30 k-vertex mesh. The two-pass refinement in `poseFloor` is load-bearing.
- A creature meant to be underground needs `buriedBase`, not a wider tolerance.
- **Do not calibrate the gaits** — `groundLift` is indexed on `stateTime` while
  `approach`/`run` are driven by `gaitPhase`.

## Cutscenes and story

- **The black cutscene sky does not reproduce unless a dungeon shot ran first in
  the same page.** A targeted re-shoot looks perfect. That ordering dependency
  *is* the bug — it is a state leak out of `Dungeons`, which is registered last
  and overrides exposure, grade and atmosphere.
- **`Cinematics.seek()` only walks forward** (`while (this.tl.t < t)`). Seeking
  backward silently returns the same frame. To review a cutscene: `stop()` →
  `play(def)` → `seek(t)` per beat. The live def is `cine.scene`, not `cine.def`.
- **Hammerhead's apron is 3.2 m above `Terrain.heightAt`** — the town grades a
  pad. Anything snapped to the heightfield there ends up under the tarmac.
- Shoot from the sun side; `Opening.ts:96-104` derives `side` from the live sun.

## Systems and integration

- **5,765 lines of RPG systems were dead code** — constructed, ticked, read by
  nothing, while the HUD drew invented literals over them. **Existence is not
  integration.** That is why `src/tools/integration.mts` exists.
- **`spec.at ?? 6`** — `spec` can be the string `'title'`, and
  `String.prototype.at` *is a function, not undefined*, so `??` never fired. The
  title camera resolved to `NaN` and rendered black.
- **Undefined mip level in divergent control flow.** The cloud weather map was
  read inside a raymarch whose neighbouring pixels diverge, so the implicit
  derivative spanned kilometres and the hardware picked the coarsest mip — a
  uniform coverage value with no holes. That was the black slab in the sky.
- **The cloud raymarch ran for the water reflection camera**, marching rays
  *downward* through the water plane. That is why the storm had no sky.
- **`NaN` HP on new characters** — `hp = maxHp` ran before `hpDrain` was
  assigned, and `maxHp` subtracts it.
- **The party roster showed Prompto twice** — companions merged by index into a
  table whose slot 0 is Noctis.
- **Boulders hung off cliff faces** — sunk along −Y instead of the surface normal.

- **Boot work that looks discardable can be load-bearing for a posed scenario.**
  `Director.init` arms `HuntRuntime`, which stages every accepted quest's set
  piece — building a `BossFight` — and under `?shoot` the `setLive(false)` two
  lines later tears it straight back down. 209 ms spent on a fight no frame ever
  shows, and deferring it is obviously correct until you measure: two cold
  captures either side moved `combat_stagger` to **3.300/255 against a floor of
  2.27**, with the sabertusk at a visibly different point in its walk.
  Constructing and discarding the boss advances state the posed *combat*
  scenarios inherit, and nothing about those scenarios says so. Tried and
  reverted 2026-08-25. **Before deleting boot work on the grounds that its
  output is thrown away, diff the corpus cold — the output is not the only
  thing it produced.**

## Harness and measurement

- **Toggling one post pass and settling four frames is not an ablation.** Three
  things move underneath it and none is the pass: the subject keeps *animating*
  under `settle`, TAA keeps *converging* so a later stage is quieter for free,
  and four frames after a toggle is a transient in which the neighbourhood clamp
  is rejecting most of the history. Re-running the shipped configuration last
  came back reading like a fix. Re-pose, apply the variable, `resetHistory()`,
  run the same frame count, and repeat the null ablation as a floor —
  `src/tools/probes/weavebisect.mts` is the shape.
- **`applyShot` re-applies the quality tier, which sets `gtao.enabled`.** Ablate
  a post pass *before* posing and you photograph a frame with the pass switched
  back on. That reads as innocence. Print the flags that were in force at the
  moment of capture, not the ones you set.

- **The machine saturates.** Six or more concurrent headless Chromiums make every
  measurement worthless *and* stall agents outright — that is what killed three
  agents in one round. **Cap concurrency at ~4.**
- **One `PORT` per worktree; the capture daemon takes `PORT+1`.** Aiming
  `framecam.mts` at the daemon port hangs for the full 300 s timeout.
- **A stale capture daemon from a dead worktree holds the port.** `shoot.mts`
  correctly refuses to reuse it and the error names the running root.
  `lsof -ti :<port> -sTCP:LISTEN | xargs kill`.
- **`shoot.mts --prod` leaves a `vite preview` on your `PORT`, and nothing after
  it refuses to reuse it.** `bootprof.mts` and `probe.mts` both take an open port
  as a running dev server, so every measurement after a `--prod` capture is
  silently taken against the `dist/` that existed at build time. It looks like
  the change simply had no effect — `bootPhase` marks added minutes earlier just
  do not appear. `ps -o command= -p $(lsof -ti :$PORT -sTCP:LISTEN)` names it in
  one line; the tell is the word `preview`.
- **`perf.mts`'s ruler measures its noise floor on `shots[0]`**, so **the order
  of the arguments decides whether a run certifies**. `perf A B` and `perf B A`
  can disagree about the same machine and the same build. Measured this way:
  the full corpus (led by `hero_closeup`, a quiet shot) certified at a 16%
  floor, while a six-shot subset of the *same* machine minutes later, led by
  `poi_reststop`, voided at 35%. Both readings are honest about their own lead
  shot; neither is a property of the machine. **Do not lead a run with a quiet
  shot to get a low floor and then quote a heavy one against it** — that is the
  exact self-flattery the ruler exists to prevent. The real fix is a floor per
  shot, which is §6.2's lesson applied to `perf.mts` and not just `imgdiff.mts`,
  and it is not built.
- **The noise floor is per-shot, not the constant 1.5–1.9 everyone quotes.**
  `prompto_closeup` measures 0.373. The determinism work would have been declared
  finished at 2.068 without measuring the floor for that specific shot.
- **`git stash` on a clean tree stashes nothing**, so both halves of the A/B run
  the same build. Two plausible numbers, conclusion exactly backwards. **Use
  `git checkout <sha> -- <path>` for A/Bs.**
- **`imgdiff.mts` and `crop.mts` decode PNG only.** Capture `--jpeg` for reading,
  PNG for measuring.
- **`import('three')` does not resolve inside a `/eval` body** — no import map for
  the bare specifier, and `/node_modules/three/build/three.module.js` 404s under
  vite. Grab the constructor off a live object. App modules *do* resolve by their
  served path: `import('/world/veg/Biomes.ts')`, **not** `/src/world/...`, because
  `src/` is vite's root.
- **A clean `vite build` does not mean the page runs.** Boot the page.
- **`tmp/` is disposable by design** and gets cleared. A probe worth keeping goes
  in `src/tools/`, not `tmp/`. A shared scratchpad is shared — another agent
  overwrote a live probe script mid-session; name scratch files with your agent id.

- **A recorded noise floor exists for 18 shots out of 142.** Every other shot is
  checked against `DEFAULT_LIMIT` = 2.0 in `imgdiff.mts`, which is a placeholder
  and not a measurement — and `imgdiff` prints it in the same `floor` column as
  a real one, so "0.8, floor 2.00" and "0.8, floor 2.00" mean entirely different
  things depending on whether the shot is in `project/noise-floors.json`. Check
  the file before believing the column. Calibrate what you care about first:
  two `--cold` captures of one build, then `imgdiff --calibrate`.
- **...and those floors are COLD floors, while every tool captures WARM.** The
  file's own note says a warm pair differs by 4-6x a cold one, because the
  daemon reuses pages. Both errors are live: on 2026-08-25 a warm full-corpus
  diff read 3.106/255 on `combat_stagger` against a *default* 2.0 and looked
  like a regression when it was noise — and the same gap can hide a real change
  the other way. **Diff cold against cold, against a floor you measured.**
- **`imgdiff` refuses a same-build comparison, and two of those refusals are
  wrong.** `--nobake`, `--post=` and `--hide=` make one commit draw genuinely
  different frames, and `--cold` deliberately bypasses the frame cache — so two
  `--cold` captures of one build *are* the floor measurement, not a cache hit.
  A capture's manifest now records a `variant` and the refusal keys on build
  plus variant; `--calibrate` is exempt outright. If you hit the refusal on a
  comparison you know is real, check whether it is one of these before working
  around it by dirtying the tree, which makes the result "not evidence".

## Baked caches

- **An index that "drops an entry once served" frees nothing, and its own
  docstring will tell you it does.** `TexBake`'s store was a `Map` whose every
  entry carried `buf` — *the whole inflated container* — and `take()` deleted
  the entry the moment a generator took its texels. The docstring concluded from
  that that the resident set after boot was "the ones a live `DataTexture` owns
  plus the ones nothing has asked for yet". It was **both containers, whole, for
  the life of the session — 134.4 MB**, because `index.delete` removes the
  *lookup*, not the reference, and one surviving entry pins every byte. One
  always survives: the 17.3 MB of `dgn/*` keys belongs to interiors built on
  first `Dungeons.enter()`. The tell was that `?nobake=1` ran **309 MB lighter**
  while building bit-identical content. `GeoBake` has the identical shape and
  escapes it only because its index *does* empty on the boot path. **The fix for
  this shape is a compaction, not a release** (`compactTexBake`): give each
  surviving entry its own `slice` and let the container go. A release has a call
  site question — one system too early is a silent cache miss that only shows
  when a player walks into a cave — and a compaction has none, because no key is
  dropped.
- **A stale texel bake is the one cache failure with no symptom.** `src/public/baked/`
  holds **four** caches of our own generators — `terrain.bin.gz` (the heightfield),
  `tex.bin.gz` (143 procedural `DataTexture`s, from `src/engine/TexBake.ts`),
  `texc.bin.gz` (the *drawn canvas* mip chains behind every painted face) and
  `geo.bin.gz` (the POI, megastructure and shore **geometry**, from
  `src/engine/GeoBake.ts`).
  A *missing* or *corrupt* artifact is harmless: every path falls back to the
  generator and costs only the time it used to cost. A **stale** one is not. The
  keys still resolve, the page still boots, every gate still passes, and the
  world renders with the texels a previous version of your generator produced —
  so the material edit you just made appears to do nothing, and you go looking
  in the shader.
- **Freshness keys on a content hash of a fixed source list**, `TEX_SOURCES` in
  `src/tools/texbake.mts` (and `SOURCES` in `bake.mts`). The vite plugin
  re-bakes at server start *and* on HMR when a listed file changes. **A keyed
  generator whose file is not on that list is the whole bug**: nothing re-bakes,
  nothing misses, and the old texels are served forever. Add to the list when
  you add a generator.
- **`texc.bin.gz` is the one that goes missing, and it costs two seconds of boot
  every time.** It cannot be regenerated by the vite plugin, because recording it
  needs a *browser* and the plugin only has the server that is starting. So when
  the source hash moves the plugin can only **delete** it — and it does, on the
  first server start after any merge that touches a face generator. Nothing is
  broken afterwards and no gate notices: the page falls back to `paintFace`, which
  is a 1024² canvas and an eleven-level mip chain built fifteen times, and cold
  boot quietly goes from **6.88 s back to about 9 s**. It bit the coordinator
  within an hour of the cache landing, on exactly this path.

  **After any merge, run both:** `node src/tools/texbake.mts --force` *and*
  `node src/tools/texbake.mts --canvas --force`. A boot number taken without the
  second one is not a boot number.
- **`node src/tools/texbake.mts --force` is the reset**, and `?nobake=1` takes
  all four caches out of the loop entirely for one page load — which is also how you
  prove a suspected bake bug is or is not one, in thirty seconds.
- **A shared cache means any agent can rewrite everyone's.** `src/public/baked/`
  is a symlink into the main checkout from every worktree, which is right — a
  32 MB heightfield should not be re-baked per branch. The consequence is that
  `texbake.mts --force` run from a worktree rewrites the **shared** artifacts
  from *that branch's* sources, and every other tree then boots on textures its
  own code did not generate. It is self-healing on merge and invisible until
  then. **Re-bake from `main` after every merge**, and treat a boot number or a
  material capture taken while another lane holds the cache as unverified.
- **`src/public/baked/` is a symlink to the main checkout from every worktree,
  so the cache is shared between concurrently running agents** while the
  freshness stamp is computed from whichever worktree baked last. Nothing
  breaks, but a boot number taken while another worktree owns the cache is not
  yours. `--force` after a merge.

- **`TexBake.ts` is itself in `CANVAS_SOURCES`, so editing it deletes the
  painted-face cache.** The hash changes, `vite build` prunes the stale
  artifact, and cold boot goes up ~2.5 s with every gate still green and nothing
  logged at the point it matters. Re-run `node src/tools/texbake.mts --canvas`
  after touching it. It bit twice in one session on 2026-08-25, the second time
  after the first had already been diagnosed.
- **A stale GEOMETRY bake is the sharpest version of the same failure, because
  what it serves is *well-formed*.** A stale texel is a colour that looks like a
  material choice. A stale POI compound is a compound — correctly wound,
  contract-clean, `assertAttributeContract` green — standing on a heightfield
  that has moved, or graded against an apron that no longer exists. Nothing in
  this repo can see that: `check` is green, `floatcheck` reads the group's
  position rather than its vertices, and only a person looking at the frame
  would notice a viaduct in the air. So `GEO_SOURCES` in `src/tools/texbake.mts`
  is the widest of the three source lists on purpose (the kit code, what it
  lofts, `Ecology`, `Terrain` and the clipmap, the map, `Noise`/`Rng`), and the
  vite plugin **deletes** rather than serves. **`geo.bin.gz` will go missing
  often** — any lane touching `Terrain.ts`, `Ecology.ts`, `Rocks.ts` or
  `WorldMap.ts` invalidates it — and each time cold boot silently goes back up
  by ~1.2 s. `daemon.mts --health` reports `bakedGeometry`;
  `node src/tools/texbake.mts --geo` puts it back, and `pnpm run build:full`
  now runs it.
- **A commit prunes a stale geometry bake, because `pre-commit` runs `vite build`
  and the plugin runs there.** That is correct, and it means the artifact cannot
  survive a commit that moves one of its sources — including *another lane's*
  commit. Bake AFTER the tree settles, and never in the middle of a measurement.
- **A cache read before `Props.init()` misses on every boot.** `loadTexBake()`
  starts at module eval and is *awaited* by `Props`, the eighth system. `Sky` is
  the first. The cloud volumes were added to the bake, baked correctly, shipped
  in the artifact — and scored exactly zero improvement, because `store` was
  still null when they asked and they silently regenerated. There is no warning
  for this: a miss is indistinguishable from not having a cache. Anything keyed
  and built before `Props` must await `loadTexBake()` itself.

## Process

- **Do not trust an agent's report — verify the merge.** Merge, capture, look.
- **Agents' numbers are not evidence.** One reported grass at 8.9 ms; a later
  measurement found 0.3–1.2 ms. Two agents correctly disproved a critic's claims
  by measuring. **Ask for the measurement, not the conclusion.**
- **Commit early and often, even unverified `WIP:` commits.** Three agents
  stalled with uncommitted work — ~280 lines, ~860 lines, and `Animator.rest()` —
  recovered only by committing their worktrees directly. Three more were killed
  by a laptop sleep and lost nothing. An ugly commit is enormously cheaper than a
  lost afternoon.
- **A stalled agent's transcript may be unrecoverable; its branch is not.**
  Re-dispatch a fresh agent whose first command is
  `git merge --no-edit worktree-agent-<id>`, and say plainly which inherited
  commits have never been looked at.
- **Don't dispatch two agents onto the same file.** The one merge conflict in 114
  commits came from two agents editing `_readInput` independently.
- **Screenshots dominate an agent's transcript** — 20 PNG reads is 12–15 MB, ~95%
  of everything it carries. Capture with `--jpeg`; the model sees a 1568 px long
  edge either way.

---

## Heavy-tailed fields: rank once, then use the rank

Droplet accumulation, sediment and every other erosion output here has a heavy
tail — p50 1.92 against a p99 of 26.2 and a maximum of 51.4. Reaching for the
magnitude because it is nearer to hand cost two separate bugs in one night, and
the second one is the instructive one because the first had already been fixed.

- Encoding the placement channel as `value / p99.9`, clamped, left `wet`
  **saturated at p90 0.965** and squeezed accumulation's top percentile — the
  only part anything places against — into **0.784-1.000**.
- Then the drainage incision interpolated its three bands with
  `smoothstep(lo, hi, a)` over the same raw field, where `hi` was the single
  maximum. The smoothstep evaluated to about zero for every cell in the top
  band, and **exactly 51 cells in the whole world** came out deeper than 4 m.
  The trunk valleys the pass exists to carve did not exist, the pass ran, and
  every gate stayed green.

A **percentile** channel fixes both and documents itself: `accum > 0.97` means
*wetter than 97% of the cells that carry any water*, at any resolution, under
any erosion tuning. See `Field.rankInto`.

## A large `imgdiff` delta is not a better frame

The conjugate joint set shipped as `rg = max(rg, 0.62 * conj)` and moved
`zone_ostium_gorge` by **17.121/255 against a measured 2.00 floor, 70.3% of
pixels past 8/255** — an enormous, unambiguous, well-above-noise result. Reading
the two frames side by side, the massif had come back **smoother than before the
change**: `max()` raises the floor wherever the second grain is strong, and the
belt height is `pow(max(0, rg - 0.16) / 0.84, …)`, so it filled exactly the
valleys the primary grain had cut. The number said *changed*. Only the picture
said *worse*. Both halves of `BRIEF.md`'s loop are load-bearing.

## An audit row can be false because a name matched

`docs/plans/2026-08-21-fable-procedural-modeling.md` was ticked against the tree
by a careful agent, and **five of its rows did not survive re-checking** — four
"NOT DONE" rows that were long since built (`mixSeed`, the `_outcrops` RNG
coupling, and both halves of §4.4's sampling rules), and one **"DONE"** row,
§2.2 talus aprons, whose three cited files contained the *word* `talus` — a
scatter-mix key, a rock archetype and a splat weight — and no geometry at all.
`grep -rn "dilat"` returned nothing.

This is the same failure as "Names nothing ever verified" below, applied to a
document instead of to code, and it is worse there: nothing type-checks a plan.
**Re-audit a row before building from it, and record the disproof in the plan
rather than deleting the row** — a plan that reads as current and is not is the
expensive kind of wrong.

## An assert inside `init()` hangs the boot instead of failing it

`src/util/GeoAssert.ts` landed with the geometry checks, and the first thing it
did was cost an agent most of an hour. A `throw` from anything on an `init()`
path means `GAME.ready` is never set, so **every browser-backed tool on the
machine returns a bare `waitForFunction` timeout with no message** —
indistinguishable from a slow boot, a broken build, or the daemon restarting,
all of which can be happening at the same time. Catch and `console.error`
instead: still red, `shoot.mts` still exits non-zero on a console error, and the
page still boots so you can see the thing the assert is complaining about.

## A stale daemon registry looks exactly like a code regression

`combatloop` failed with `page.evaluate: Target page, context or browser has
been closed` on three consecutive runs against a quiet tree. `cleanup.mts`
reported **clean** each time. The cause was a registry entry for a **dead
daemon** (`stale registry for a dead daemon (pid …); cleared`), and after
clearing it the same commit passed **31/31** with nothing else changed.

The same shape ate a whole gate run in another lane — 9 of 16, every failure a
`page.waitForFunction: Timeout` or `ECONNRESET`, none of them real — while the
daemon was restart-looping with `uptimeSec` under 15 on every poll.

**Before believing any leased-page gate, check `daemon.mts --health` uptime, and
run `cleanup.mts` when a browser-backed tool fails in a way the code cannot
explain.** `cleanup` reporting "clean" does not mean the registry is.

## `frame(+y)` reverses a tube's angular sense

A ring built as a plain `(cos a, y, sin a)` and a tube built through a
`frame(+y)` basis sweep their angle parameter in **opposite rotational
senses**. Welding one to the other gives you a surface whose triangles disagree
with their own vertex normals, and it renders as a black bell rather than as an
obvious hole. Probed on one tree: **640 tube triangles disagreeing, 40 flare
triangles agreeing** — and the old root skirt had carried the same bug for as
long as it existed, small enough and dark enough to pass as shading. It is most
of why trunks have always read as posts stuck in dirt.

`assertConsistentWinding` does **not** catch this: edge parity is
orientation-*relative*, and a flare is a disconnected shell. The check that
catches it has to be orientation-absolute.

## `cleanup.mts` reports "clean" while 96 orphaned vite servers hold 40 GB

Measured 2026-08-24, at the end of a night in which the capture daemon restarted
many times: **96 `vite` processes with PPID 1**, some ten hours old, holding
**39.7 GB** of RSS between them. `cleanup.mts` printed `clean — no orphaned
servers or browsers`.

The reason is in its own first line: `no capture daemon registered`. With no
daemon in the registry it has nothing to compare against, so it protects nothing
**and detects nothing** — and the failure is silent and reads as reassurance.
Each orphan is a server whose parent daemon died without reaping it.

This is why **every `perf.mts` run that night voided.** One returned
`RULER_VALID: false` with its noise floor *growing* 0.65 -> 1.75 ms during the
run against a 5.1 ms frame; a full `check:perf` was abandoned after 33 minutes.
A perf number is meaningless with a hundred servers on the machine, and nothing
in the harness says so.

Until `cleanup` learns to find them:

```
ps -eo pid,ppid,command | grep '[v]ite/bin/vite.js' | awk '$2==1{print $1}' | xargs -r kill
```

PPID 1 is the discriminator — a live daemon's servers are its children, so a
parentless one is always an orphan and is always safe to kill.

## An ablation photographed one frame later is photographed on a different shadow phase — FIXED in `da7bfe2`

Reconciling a **7.6x** disagreement between two instruments measuring the same
frame: hiding **one waymark** — 4 meshes and 1,334 triangles, counted in-page —
removed **301 draws and 4.50 M triangles**, within 12 draws of hiding the entire
POI system. Every `--hide` frame rendered about **320 draws and 4.5 M triangles
less than its control, whatever you hid**, so no single `--hide` delta in this
repo before `da7bfe2` was a cost, and the workaround was to difference two
ablations so the offset cancels.

It was read as the ablation perturbing streaming. **It was one frame.**

`Sky._updateCascades` refreshes the three shadow cascades on a stride of
**[1, 2, 4]** at `ultra`, keyed on `game.time.frame`, and `Clouds.renderShadow`
on `frame & 3`. The near cascade is 183 draws, the middle +148, the far +298.
`applyShot` calls `resetClock()`, so the pose always ends on frame **8** — a
multiple of 4, the phase on which all three cascades *and* the cloud shadow are
due, the most expensive frame of the cycle. One held pose at `town_forecourt`
(`src/tools/_probe/hidephase.mts`):

    frame  8   9   10  11  12  13  14  15  16
    calls  791 612 690 612 791 612 690 612 791

The hide pass hid its objects and then stepped **one more frame**. Control on 8,
ablation on 9 — and the gap between two phases of the shadow schedule was
reported as the cost of the object. The fix spends the last settle frame on the
ablation rather than adding one after it, so both arms photograph frame 8.
Measured after, `--raw`, same shot, same page: control **1193**, one waymark
**1188** (5 draws), `poi_kits` **1160** (33 draws) — and 1188 − 1160 = **28**,
which is exactly what the differencing workaround used to recover. The offset is
gone and the number the workaround was reaching for is now reported directly.

**The general shape, and it outlives this bug: a frame is not a scalar function
of the world, it is a function of the world *and* the frame index.** Anything in
this renderer on a stride — cascades, cloud shadows, the env probe, TAA history
— makes two frames of an identical world differ by hundreds of draws. Any A/B
that does not run the two arms to the *same frame count* is measuring the
schedule. That is the same root as `resetClock()` in the pose (period-2 spreads
of 20 draws) and as `drawcheck` gating "the expensive phase, comparable, not
average".

## `shoot.mts` does not empty `--out`, so `imgdiff --calibrate` re-derives floors from two different builds

`project/noise-floors.json` is what stops this project reading boot noise as a
result, and the documented way to regenerate it is two `--cold` captures of one
build into `tmp/nf/a` and `tmp/nf/b` followed by `imgdiff --calibrate`. Those two
directory names are a convention, `tmp/` is shared scratch, and **`shoot.mts`
writes into `--out` without clearing it**.

Measured 2026-08-30 while re-baselining four re-framed shots. Four shots were
captured; `imgdiff --calibrate` reported **`calibrated 17 shot(s)`** and rewrote
`poi_haven` 0.66 -> 0.913 and `zone_longwythe` 1.231 -> 0.965 from PNGs left in
those directories on **2026-08-23 and 2026-08-28** — a week and one week apart,
across dozens of commits from other lanes. The run exits 0 and prints a tidy
table with a `floor` column beside every row, so nothing about the output says
that thirteen of the seventeen rows are cross-build.

It is the failure the file exists to prevent, arriving through the file itself,
and it is silent in both directions: a floor raised by another lane's landform
change hides your regression, and a floor lowered by it turns your noise into a
result.

- **Clear the directories first**, or capture into a fresh pair per run.
- **Then diff the file** and check that the only rows that moved are the ones you
  actually re-shot. `--calibrate` rewrites whatever it found; it does not merge.
- The same applies to any `imgdiff A B` over directories rather than files.

## Every recorded `imgdiff` noise floor is a COLD floor, and nobody captures cold

`project/noise-floors.json` is what stops this project reading boot noise as a
result — and the floors in it were measured on **cold** captures, while every
real comparison is taken **warm**. Measured 2026-08-24 while trying to A/B a
material change:

| shot | before vs after | **two captures of the SAME build** |
|---|---|---|
| `landmark_meteor` | 5.63 | **5.37** |
| `zone_longwythe` | 2.96 | **2.94** |
| `poi_haven` | 4.03 | **3.94** |

The change was real and visible, and the whole-frame mean could not see it,
because warm-to-warm noise is *already* that large. Two `--cold` captures of the
same shots reproduce to **0.4-0.83**, which is the number the file records.

So a whole-frame `imgdiff` mean is the wrong instrument for anything smaller
than a landform. Use a **box on the thing you changed, plus a control box on
something you did not, plus a repeat run** — that is what separated a −34%
texture-energy change from 0.06-0.09 of run noise on the same frames.

`landmark_meteor` was not in the floors file at all until `d3a7041`.

## On a shared trunk, a before/after corpus diff by sha measures every lane

`imgdiff tmp/shots/<baseline sha> tmp/shots/HEAD` is the reflex, and on a trunk
four lanes are committing to it is meaningless. Measured 2026-08-28: the memory
lane diffed its own baseline against HEAD and got **129 of 142 shots over floor,
worst mean 73.0/255** — from the peak cliff bands, the drainage incision, the
tarn beds, the graded aprons and the meteor's fissure glow, none of which it had
touched. Thirty commits from three other lanes landed inside its window.

**Build an ablation tree instead**, and do it with plumbing so the shared
worktree and the shared index are never touched:

    GIT_INDEX_FILE=/tmp/x git read-tree HEAD
    GIT_INDEX_FILE=/tmp/x git update-index --cacheinfo "100644,$(git rev-parse $BASE:$f),$f"
    tree=$(GIT_INDEX_FILE=/tmp/x git write-tree)
    commit=$(git commit-tree "$tree" -p HEAD -m ablation)

`--build <commit>` takes any commit object, branch or not. First run
`git log $BASE..HEAD -- <each file>` and check that the files you are about to
revert carry **only** your commits; if one of them also carries somebody else's,
reverting it puts their change in your diff too.

## `texc.bin.gz` cannot survive a `bootprof --build <old sha>`

`texbake --canvas` bakes from the **working tree**, and the daemon materialises a
sha tree with `src/public/baked` **symlinked to the repo's**. So when
`bootprof --build <sha>` runs a prod build of a sha whose face sources differ
from the working tree, that build's vite plugin sees a hash it does not
recognise and prunes the real file — and the arm you are measuring, plus every
arm after it, boots with the painted-face cache cold.

That is a ~135 MB difference in what you are measuring, in a report about
memory. **A four-cache A/B is only possible between shas whose TEX/GEO sources
agree**; between any others, the honest move is to delete the flapping cache
before *every* arm, so absent-in-all is a controlled variable rather than
present-in-some being a confound. `geo.bin.gz` needs the same treatment for a
different reason: any lane touching a `GEO_SOURCES` file deletes it, and one run
lost it *twice inside a single `bootprof` invocation*.

## `cleanup.mts` and the daemon disagree about whether a daemon exists

Seen twice in one session: `cleanup.mts` printing *"no capture daemon registered
— clean"* while `daemon.mts --health` reported a live daemon on 36646 with
**12 138 s of uptime**. The registry and the process disagree, and `cleanup` is
exactly what everyone reaches for when captures start failing. Trust
`--health`, and see the orphaned-vite entry above for what `cleanup` misses when
the registry is empty.

## Names nothing ever verified

A guess about a name compiles. `a.b || a.c || a.d` reads like defensive coding
and is really three guesses, of which at most one was ever true; a string handed
to `spawn` or to `game.get()` crosses a boundary the compiler does not follow.
Under `any` none of it is checked, so the guess that happens to be right carries
the feature and the rest are silently dead.

**The tell is that the dead arms are invisible precisely because the live one
works.** Nothing errors, nothing logs, no gate fails. `WeaponWheel` lit its slot
from `Combat.activeWeapon`, which has never existed — the real field is
`weaponSlot` — and because the wheel still drew, the highlight sat on slot 0 from
the day it was written until a type check asked. When *no* arm resolves the
feature just stops, which looks exactly like a feature nobody got round to.

Found by giving `game` its real type (`9f16322`), all confirmed by grepping the
whole tree, not by reading the chain:

| the guess | what was actually true |
|---|---|
| `PostFX`: `weather.mode ?? current ?? type ?? preset` | the field is `name`. **Heavy-weather grade flattening has never applied** — a storm graded like noon. |
| `CameraRig`: `props.cameraColliders \|\| colliders \|\| collisionMeshes` | `Props` declares none of them and nothing assigns them. **The camera has never collided with a prop**: a `Raycaster` built at boot and never fired. |
| `game.get('Vehicle')`, `game.get('Hammerhead')` — 4 sites | never registered. `Game.init`'s boot order plus Director's three additions are the *only* `add()` sites in the repo. |
| `Harvest`: `s.root \|\| s.group \|\| s.container` over 7 systems | only `root` exists on any of them. |
| `sky.timeOfDay ?? sky.hours ?? sky.hour` — 5 files | `hours`. One site carried a comment promising `timeOfDay` was "accepted too so any other implementation of the documented contract still drives us". No implementation ever had it. |
| `Combat.activeWeapon`, `Combat.techniques`, `Director.areaName`/`region`/`areaSub`/`state`, `Party.companions`, `Enemies.active`/`enemies`, `game.questWaypoint`, `car.position` | none exist. Most sat behind a working first arm; the last two were the only arm, so those features never ran at all. |
| `mapshoot`/`chartshoot`/`mapview`: `--config src/tools/vite.map.config.js` | renamed to `.mts` by the port. Vite died with "Cannot resolve entry module" — three tools broken on `main`. |
| `Instruments.ts` cited `src/tools/profile.mts` for a measured claim | the tool is at `src/audio/tools/profile.mts`. **Right extension, wrong directory** — an extension-only sweep misses this; only resolving the path catches it. |

Found by the last `any` pass (`window.GAME: Game`, plus a `paths` mapping so the
harness's in-page `import('/…')` URLs resolve). **The gates were guessing too:**

| the guess | what was actually true |
|---|---|
| `integration`: `day.rest('caravan')` | `DayCycle.rest` takes a **context** (`{ expBank, party, lodging, … }`). A string meant `ctx.expBank` was undefined, the redemption never ran, and the probe only asserted that *something* came back. Now `rpg.restAt('caravan')`, and it passes. |
| `gameplay`: `combat.castSpell('fire', at)` | `castSpell` takes a **slot index**. `equipped['fire']` missed every time and answered `{ ok: false, reason: 'empty-slot' }` — an *object*, so the `?? combat.elemancy.cast(…)` behind it never ran either. **The `magic` perf scenario has measured an idle field for its whole life.** |
| `integration`: `inv.listByCategory('curative')` | it takes no argument and buckets the whole bag, so the "curative" count was the number of *categories* carried. |
| `integration`: `cand.cost <= ap` over Ascension nodes | the price is `ap`; `(n.cost ?? 0)` compared 0 to the wallet. Harmless only because `availableNodes()` already filters on affordability. |
| `integration`: `m.ai \|\| m.combat`, `rpg.downed`, `ix.target \|\| ix.nearest`, `npcs.npcs`, `r.driving \|\| r.occupied`, `wm.list()`, `d.isInside()` | none exist. Each sat behind a working first arm, except `d.isInside()` — a getter, so the `typeof === 'function'` arm has never been taken. |
| `Set.length` / `Map.length` (`a.unlocked.size ?? a.unlocked.length`, `ix.items.size ?? ix.items.length`) | neither collection has `length`. Always `undefined`, always the second arm dead. |
| `attrib`: a `[label, systemKey, field]` table driving `g.get(key)` | the third column was never read, and `g.get()` over a `string` hands back *every* system at once — three of the four branches were reaching for fields the union does not have. |
| `driftcheck`: `surf0.color.constructor` for `THREE.Color` | the terrain material is a `ShaderMaterial` and has no `color` at all. The `Color` now comes off a light. |
| `BossFight.resolveStrike` / `slamAt` / `_handPos` | **nothing called them**, for months, while typed and compiling. `Enemies.onStrike` went to `EncounterDirector.resolveStrike`, which sweeps an arc off the enemy's *root* — right for a sabertusk, wrong for a creature whose fist arrives thirteen metres from its navel, so Titan's slam damaged whatever stood on his feet and the crater never rendered. **Fixed (`99e2107`)**: the director gives an active boss fight first refusal and `BossFight` returns true only when it really handled the blow. `probes/titanfist.mts` measures it, through `Enemies.onStrike` rather than by calling the method. |
| `CameraRig.setLockOn` | **nothing calls it.** `lockOn` has only ever been `null`, so the combat-framing block in `lateUpdate` has never run; `CombatSystem.setLockOn` drives the HUD reticle, not the camera. |
| `Ascension.activeEffects`: five independent `if`s over one payload | `{ stat, value }` and `{ mult, value }` also fell into the `value` arm, writing `values['500'] = NaN` for every flat stat node. Inert (`value()` returns `NaN \|\| 0`), but it is why the arms are now exclusive. |
| `Game.applyShot`: `rig.setShot({ pos: shot.pos })` | passed the authored array **by reference**, so `lateUpdate`'s ground clamp wrote the raised height back into the `SHOTS` table. It copies now. |

What to do about it:

- **Do not write a fallback chain over field names.** If you do not know which
  name a system publishes, read the class. If two names are genuinely both
  possible, that is a contract to fix, not to guard.
- **A path or a registry key inside a string is unchecked.** `spawn`, `game.get`,
  `import()` and cvar tables all take one. When you rename, grep the strings.
- **Type the receiver and the dead arms fall out by themselves.** Every entry
  above was found by making one `any` real, not by auditing.

## Drawing things you cannot see

Four defects from the fishing lane, all of them invisible to a probe that
reported entirely correct numbers, and all of them found only by reading the
capture.

- **A `THREE.Line` is one pixel wide, always.** `linewidth` is a no-op on every
  WebGL renderer. The fishing line was absent from three consecutive captures
  while the probe printed the right endpoints every time; it is a scaled
  cylinder now. If you cannot see a thin thing you drew, check the *primitive*
  before you check the maths.
- **A bone socket's world matrix is stale during `update`.** Anything hung off
  `attach.handR` and read in a system's `update` is posed from the previous
  frame — the fishing line left Noctis at chest height and lay flat in the
  grass. Read it in `lateUpdate`. The same tick is where a `hud.setMenuOpen`
  belongs, because `Menus` boots after `Rpg` and overwrites it otherwise.
- **A local Euler on a bone socket is a spear through the character's head.**
  Whatever angle looks right in one pose is wrong in the next. Write the world
  quaternion and divide the parent's out.
- **Physically correct is not legible.** A 7.5 cm float at 20 m on moving water
  cannot be found in a 1600x900 frame, and white type on sunlit grass cannot be
  read at all. Both were correct and both were useless.

And one measurement trap, because the failure looked exactly like a real
defect: **an animating rig moves several metres between frames.** Comparing
Titan's slam point against a hand position read four frames earlier measures
the animation, not the wiring.

## Diagnoses that were wrong

Read this section twice. Every one of these stood for weeks or months, protected
by a plausible write-up, and every one was caught by **measuring rather than
trusting the document that recorded it**. Treat every handoff as a *lead*.

| recorded as | actually |
|---|---|
| the chevron hatch = heightfield normals, "proven by forcing `cliffAmt = bedThrough = runnelAmt = 0`" | **GTAO** reconstructing normals from depth. The negative result was real; the inference from it was not. |
| the crosshatch on all skin = a GTAO dither that TAA cannot resolve on **skinned** meshes, sharpened by CAS | **the contact-shadow march**, undersampled in screen space. GTAO off makes it *worse* (14.59 vs 10.93 rms); making TAA ignore the velocity buffer entirely reproduces the shipped frame to 0.001. Only the third link, CAS, was right, and it is the amplifier. The negative result — *not the material, it survives a flat white face* — was real and is still the best thing in that handoff. |
| `combatloop` 21/30 = a game regression | **a stale test** — it still pressed `KeyH` after the keymap moved to G/J/K, which opened the controls card and `Menus._pointerLock` disabled input |
| `Terrain.groundColorAt` disagrees with the shader | **it never existed.** `Ecology.groundColor` called two undefined functions, so every plant in the world tinted from a hard-coded brown ramp. It exists now and mirrors the shader's far-LOD path. |
| dualhorn/bloodhorn "deep rebuild, **verified by eye**" | rendering **flat black** from the `Color.setHex` NaN above |
| the horizontal wood grain = the analytic strata | the rock **tile** — `Layers.ts` recipe 3 |
| grass costs 8.9 ms | 0.3–1.2 ms |
| `walk` runs at ~57.5 fps | **49.8 fps.** The 57.5 was taken under six-agent load and was never real. |
| capture order-dependence = "likely vegetation tile streaming" | **the wind.** Pinning vegetation streaming moved the measurement by 0.009/255. `Weather.resetClock` set only `_snap`, which skips the preset lerp, while the gust phase it never touched drove `windStrength` 0.840 vs 0.944 between a page's first shot and its sixth. |
| `walk` runs at 42.7 fps, and the whole open world at ~40 | **189 fps.** Every perf number ever taken here was 3-5x too slow. `ruler.mts` rendered 20 frames inside one synchronous JS task, and a task that keeps the GPU busy past one 16.7 ms refresh is throttled ~5x. The `49.8 fps` row above is wrong for the same reason, and so is the correction that replaced it. |

The pattern is the same every time: a correct negative result, an inference drawn
from it that was never itself tested, and a well-written paragraph that made the
inference look measured. **Ask which probe was run, not what the conclusion was.**

The wind entry is worth one more sentence, because it shows the failure mode from
the other side. The diff was concentrated on grass tips, twigs and hair — thin
silhouettes — which reads as *streaming* or *TAA* and reads as **noise** if you
only look at the mean. It only named itself once the state was probed directly
and two numbers came back different. **When a visual difference has no obvious
carrier, print the state, do not stare at the frame.**

## The measurement trap that cost this project every perf number it ever had

Read this beside the table above; it is the same failure at the scale of an
instrument rather than a diagnosis.

**A rendering loop that never returns to the event loop measures the harness.**
On this machine a synchronous task that keeps the GPU busy for longer than one
16.7 ms display refresh is throttled by about five times. Frames rendered per
synchronous task, against the steady state of a held `party_walk`:

| frames per task | 1 | 2 | 4 | 8 | 16 | 64 |
|---|---|---|---|---|---|---|
| ms per frame | 5.4 | 5.6 | 22.8 | 22.3 | 21.7 | 23.9 |

`ruler.mts` rendered twenty. Every number in `project/baseline-perf.json` and
`project/baseline-gameplay.json`, and every perf claim in every handoff before
2026-08-23, was taken a factor of five inside that cliff.

Four things make it nastier than an ordinary slow instrument.

- **It is not a constant factor.** Correlation between the old per-shot numbers
  and the true ones, over the 140 shots the two runs share, is **0.107**. The
  ranking inverted: `vista_dawn` was called the second worst shot in the game
  at 33 fps and is 208 fps, while the town shots it called comfortable are the
  six slowest in the corpus. An old number cannot be rescued by dividing it.
- **It is not thermal, not duty cycle, not queue depth.** A 1 ms `setTimeout`
  between frames — 86% GPU duty, almost no idle — removes it entirely. A
  `gl.finish()` after every single frame does *not*, if the loop never yields.
  A nearly empty scene degrades 3.1x on the same loop, which is what proves it
  has nothing to do with what we draw.
- **It hid a second bug behind itself.** A loop that never yields never lets a
  promise continuation run, so streaming, decodes and every deferred build in
  the game were frozen for the whole of every measurement ever taken. The
  harness was photographing a game with its async half switched off. `perf.mts`
  now warms the *page* before its first noise floor, because the first few
  hundred yielding frames are the game catching up on work it was owed: the
  floor reads 23.60 ms there and 0.95 ms at the end of the same run.
- **It looked exactly like a real result.** 40 fps standing in a field, combat
  comfortably faster than walking, a mean of 63 fps — an entirely plausible
  profile for a three.js open world, and the plausible *shape* is what made it
  credible. `attrib.mts` then took its baseline in the fast window before the
  throttle engaged and reported subsystem costs summing to 300% of the frame.
  That absurdity was the only visible symptom, and it read as "ablation is
  noisy".

The probes are kept, one per eliminated explanation, in the order they were
written: `perfdrift`, `perfstep`, `perfpaced`, `perfduty`, `perffalsify`,
`perfdepth`, `perfseries`, `perfknee`, `perfgroup`. If you are ever about to
write a loop that times rendering, read `perfgroup.mts` first.

**Still unexplained, and reported rather than buried.** Even paced at 60 Hz on
a static shot, 12–31% of frames cost 20–90 ms instead of 5. It is pure CPU time
inside `post.render`; it creates no GL resources; it survives rendering
offscreen so it is not presentation; it attaches to no composer pass (it lands
on whichever one is executing); and turning off *any* post pass moves it from
21% to 12–15%, which is the signature of an aggregate and not of a cause. It
does **not** appear in `gameplay.mts`'s segments, where `idle`, `walk` and
`sprint` are all 0% over budget — and that difference between the two harnesses
is itself unexplained. Nobody has separated the part that is ours from the part
that is the harness, so it is printed as its own `>16` column rather than
folded into a median.

## The daemon reuses pages, and reuse is a state machine

Two bugs from the harness build, opposite ends of one mistake. Both produced
frames and results that were **plausible and wrong**, which is the class this
whole document exists for.

**A leased page must never be pooled.** The first pooling rule was "`?shoot=1`
means capture, and capture pages are safe to reuse". That sounds right and it is
not: `integration.mts` boots with `?shoot=1` and then drives fifteen minutes of
real gameplay — combat, quests, camping, fishing — stepping the sim by hand. Two
consecutive runs disagreed (26 pass, then 24 pass with two "not integrated")
because the second was handed a world the first had already played. **The
discriminator is not the query, it is how the page was obtained.** A tool that
asked for frames only posed shots; a tool that took a *lease* asked for the page
because it intends to do something the daemon can neither see nor undo.

**A freshly booted page must never be reset.** A fresh boot is already in the
state `GAME.reset()` is trying to reproduce, so calling it there can only move
the page *away* from that state. It did: `Menus.setScreen('main')` opened the
title screen on a page nothing had dirtied, and `integration` went from 27 pass
to 24 with no error anywhere. A just-booted page needs the clock zeroed and the
loading screen removed, nothing else. `reset()` is for **reuse**.

The general shape: **if a page hand-off can carry state, something must check
that it does not.** That is `checkResetDrift` — a `follow` shot posed on a page
driven through a dungeon and reset, byte-compared against the fresh-boot frame,
once per build. Currently 0.974/255 against a *measured* 1.493/255 boot-to-boot
floor. Note the floor: two fresh boots of the same shot on a quiet machine are
**not** byte-identical, so any check that demands zero will cry wolf forever.

## A width guarantee stated on one axis is not a guarantee on a silhouette

Every stacking rule in `Rocks.ts` was written as *"a course may not be more than
1.15x wider than the one below it"* and every one of them was true — of the
block's **local x half-extent**. The courses are then yawed over a full turn on a
cross-section that is deliberately anisotropic (`thin` is 0.34 for a fin;
`_item` draws `sx`/`sz` as independent gaussians at sd 0.30). Two courses ninety
degrees apart present a cap far wider than the neck beneath it, from an azimuth
nobody wrote a rule about.

Measured over 16 viewing azimuths (`src/tools/probes/mushroom.mts`): the median
tor stood **1.23-1.64x** wider than its own support somewhere, and a corestone
stack reached **7.4x**. A blind judge called it *"the same mushroom rock"* for
three consecutive rounds while every rule in the file passed.

**And `silhouette.mts` cannot see it, by construction.** Every distance there is
*between two subjects*, minimised over azimuth and mirror: a family in which
every member is a wide cap on a narrow neck scores as varied so long as the caps
differ. `rock:tor:fin` read 17.6/24 distinct with 80% of its members mushrooms.
The general form — **a bench that grades subjects against each other is blind to
whatever the whole family shares**, and that is exactly what a blind judge sees
first.

Fixing it also showed the other half: aligning the courses onto one fabric axis
took `rock:tor:fin` to **11.4/24** and breached three floors. **Some of the
variety a ratchet has recorded can be the defect paying for it.** Buy it back on
parameters that cannot reproduce the defect, and say which those are.

## A default of zero that means "skip the whole pass"

`Cluster.maternScatter` has carried radius-aware separation since it was
written, and `slack` defaults to **0**, which skips the pass entirely. Exactly
one of its four callers ever passed a value. Every tree and every bush in the
world was placed with **no minimum spacing at all** — 9-13% of trees and 9-30%
of bushes within 1.5 m of a neighbour, trunks as close as 73 cm — for as long as
the sampler has existed, while the feature was documented, exported, tested by
the one caller that used it, and named in two handoffs.

`orphans` calls it reachable and `reachcheck` says it ran, and both are right.
Nothing anywhere reports "this option is defaulted off at three of four call
sites". **When a capability is opt-in by a falsy default, count the call sites
that opt in.**

The same shape hid a second bug behind it: the rect filter lives *inside* the
separation block, so `slack > 0 && out.length > 1` returned a halo point
whenever a window produced exactly one, and two adjacent tiles both emitted it.
Latent for as long as nothing sparse used a slack.

## Numbers that cannot be picked from throughput

`BROWSER_BUDGET = 4` looks like it should come from a throughput curve. It
cannot: measured three times, W=4 came back at 0.29, 0.31 and 0.31 req/s on a
plateau that is itself only 20% wide, so reading a peak off that column is
reading noise. It comes from **latency**, which is not noisy — mean boot 9.2 s at
W=1, 14.8 s at W=4, 32.3 s at W=6.

Two corollaries people get wrong here:

- **The machine always looks idle.** At the budget it is using 2.2 of 18 cores
  and 10 of 137 GB. The single Metal GPU binds. Do not raise the budget because
  `top` looks bored.
- **Four browsers buy 1.5× the throughput of one.** Parallelism is nearly
  worthless; not re-booting is worth 4×. Every trade-off should protect boot
  reuse over concurrency.

## The unexplained 12-35% frame-time tail was `setTimeout(0)`, not the game

**This section replaces the "Still unexplained" paragraph at the end of "The
measurement trap that cost this project every perf number it ever had".** The
paragraph is correct about every fact it states and wrong about the conclusion,
which is that nobody had separated our part from the harness's. It is all the
harness's.

`ruler.yieldTask` was `setTimeout(r, 0)`. That returns to the **task queue**.
Chromium's rendering lifecycle — style, layout, paint, and the composite that
puts the WebGL canvas and any DOM over it on screen — does not run from the task
queue; it runs from a BeginFrame. A loop that posts a new task the instant the
previous one ends starves it. The work batches, the GPU process falls behind,
and **the next GL call inside `ScenePass` blocks on a full command buffer, inside
the timed region**. That is why it read as "pure CPU inside `post.render`" to
every profiler pointed at it, why it landed on whichever composer pass happened
to be executing, and why turning off any single pass moved it a little — all of
which are properties of a queue, not of a cause.

The measurement that settles it reads the heap and the thread from **outside**
the page, because `performance.memory` is frozen headless
(`src/tools/_probe/gcwatch.mts`, CDP `Runtime.getHeapUsage` +
`Performance.getMetrics`):

| frame | wall ms | ThreadTime | TaskDuration |
|---|---|---|---|
| 8 | 4.0 | 5.1 | 5.0 |
| **9** | **312.6** | **10.9** | **10.8** |
| 10 | 20.1 | 6.6 | 6.5 |

**A 312.6 ms frame in which the main thread burned 10.9 ms.** It is blocked, not
working. The spikes are exactly every ten frames; 50 ms of real idle per frame
removes every one of them; and it is **not GC** — the heap grows a flat
+0.65 MB/frame and drops 25 MB every ~39 frames, on frames the spikes are not on.

`yieldTask` now awaits `requestAnimationFrame`, which is what `Game.start()`
does. `town_npcs` is the control that proves this is not leniency: its `>16ms`
share is real work and stays at 15-24% under both pacings, while `storm` goes
34% → 0% and its worst frame 689.9 → 13.9 ms. Wall-clock per iteration is the
same either way, so the change buys the measurement no idle.

Consequences for reading old evidence:

- **Every `>16ms` column and every worst-frame list printed before 2026-08-24 is
  mostly this.** Not the medians — those barely moved.
- `perf.mts`'s corpus `FAIL: storm at 51 fps` against 7 ms per-shot is explained:
  a shot with a 34% tail has its median at the tail's edge, and load tips it in.
- The `menu-open` stall that survived **fourteen** ablations across two lanes was
  this. Nothing in the game caused it and nothing in the game fixed it.
- A probe that times rendering must yield with rAF, not `setTimeout`. Several
  probes in `src/tools/probes/` still do not; their tails are not evidence.

## `contention()` cannot see a co-agent on a shared trunk

Two consecutive perf lanes were briefed "the machine is yours and it is quiet",
both printed `VERDICT: quiet`, and both measured through other lanes committing
every few minutes. `idle` moved 6.4 → 9.1 ms and `walk` 6.3 → 11.8 ms between
two runs with nothing touched that either could depend on.

Its `trees` check greps process arguments for `worktrees/agent-*`. **Every lane
on this repository works on one shared trunk**, so it finds nothing, always. The
other two triggers are just as blind: one browser looks like one browser whoever
owns it, and `load1 > cores * 0.7` is **12.6** on this eighteen-core box, which a
single co-agent never reaches.

Two triggers were added — a `vite build` count (the pre-commit hook runs one on
every commit by every lane, and `withExclusive` cannot queue it because it never
asks the daemon for anything) and other lanes' harness tools by name. The verdict
now names which fired. **Do not brief a perf lane that the machine is quiet
without running `printContention` first.**

### ...and then it cried wolf on an idle machine for weeks

The "other lanes' harness tools by name" trigger above was added to stop two
lanes measuring through each other. It then stopped anything from measuring at
all, in a way that reads as a real verdict:

```
other lanes' tools      : bootprof
VERDICT: CONTENDED (another lane is running bootprof) — ...
         boot times below are NOT a baseline. Re-run on a quiet tree.
```

with nothing else on the box. `contention()` excludes self by pid and walks the
process tree, but the walk went **parent -> child only** — and an agent harness
runs a tool as `bash -c 'source …snapshot.sh && node src/tools/bootprof.mts'`.
That wrapper shell's own command line contains the tool's path, so it matches
the tool regex, and it is self's *parent*, never its child. Every harness tool
invoked that way declared its own run void.

This is the same bug as the pid-string version the code comment already
recorded, one level up, and it survived because the lanes that hit it read the
boot times and skipped the verdict.

**Walking ancestors fixed half of it, and the other half fired immediately.**
Pipe a tool anywhere — `node src/tools/bootprof.mts | grep VERDICT`, which is
the most ordinary thing anyone does with one — and bash forks a second subshell
for the right-hand stage. A forked-but-not-yet-exec'd bash still carries its
parent's whole command line, and it is a **sibling** of the tool, so no ancestor
walk can ever reach it:

```
92643 41713  bash -c '… node src/tools/bootprof.mts … | …'   the wrapper
92645 92643  node src/tools/bootprof.mts --n 1               self
92646 92643  bash -c '… node src/tools/bootprof.mts … | …'   the pipe's other half
```

**The fix is to stop treating a command line as evidence of what a process is
running.** `ps -o ucomm=` gives the *executable*; a shell that has not exec'd
reads `bash` whatever its arguments say. Both shapes fall out at once, and the
ancestor walk becomes belt-and-braces rather than the only defence. Verified
both ways: a piped `bootprof` reads `quiet`, and a genuinely concurrent
`perf.mts` is still caught.

**The lesson is not about pids.** A guard that fires on a quiet machine trains
people to ignore it, and a guard people ignore is worse than no guard — the two
lanes it was meant to protect had already learned to skip the line. Note also
that it took *three* attempts to exclude self correctly, each fixing a real case
and each leaving another: by string, by pid, by ancestry, and finally by
executable.

## A probe that calls `Game.start()` can poison every later measurement

`Game.start()`'s loop is

```js
const loop = () => { this._raf = requestAnimationFrame(loop); this.frame(); };
```

It never checks `_running`, and `stop()` only cancels the one callback sitting in
`_raf`. Any path that starts the loop twice leaves an orphan chaining forever —
and **the daemon pools the page**, so the next tool handed it inherits a browser
burning a core on a game loop nobody asked for.

Seen 2026-08-24: one `chrome-headless-shell` at **105.8% CPU with nothing
running**, and three `gameplay.mts` runs 40% worse before anyone looked. The tell
is a headless chromium with high `%cpu` between runs; the cure is
`node src/tools/daemon.mts --stop`, which the next tool re-spawns.

## `anycheck` reads directories the typechecker does not

`tsconfig.tools.json` excludes `src/tools/_probe/**`, `src/tools/_reach/**`,
`src/tools/probes/**` and `src/tools/typemods/**`. `anycheck` greps text and
excludes none of them, and its ceiling is **zero**. Five `as any` in a throwaway
Node-side probe took `pnpm run check` from 17/17 to 16/17 with `tsc` perfectly
happy.

## Bumping `PROTOCOL` restarts the daemon, which closes every leased page

`ensureDaemon()` compares the client's `PROTOCOL` against the running daemon's
and **stops it** on a mismatch — correctly, because a client talking to an old
daemon debugs code that is not running. But a restart is `pool.closeAll()`, and
every long probe holding a lease dies with `Target page, context or browser has
been closed`, which reads at the call site as the game crashing.

So editing `daemon.mts` and bumping `PROTOCOL` while somebody's thirty-minute
`longplay` is running kills it on the *next tool invocation by anyone* —
including your own `--health`.

**It cost a whole `check` run in the commit that documented it.** The bump landed
and the next `pnpm run check` started nine browser clients at once; the first one
to call `ensureDaemon()` stopped the old daemon, and its eight siblings came back
`drawcheck VOID`, `reachcheck FAIL`, and `uxcheck`/`integration` FAIL with
*"Target page, context or browser has been closed"*. Four gates, none of them
broken, and a table that reads like a game regression — which is precisely the
failure mode `LANDMINES.md` exists for.

`check.mts` now calls `ensureDaemon()` **once, before it spawns anything**, so
the restart is serial and invisible. That closes the suite's exposure and not
yours: **add the field, bump the protocol, and land the restart when
`node src/tools/daemon.mts --wait quiet --for 900` says the machine is idle.**
`/health` lists live leases and their remaining TTL, which is the thing to look
at before restarting anything.

## A gate can disagree with itself between invocation paths

`floatcheck`, `integration` and `driftcheck` have each been seen red inside
`pnpm run check` and green standalone, or the reverse. The causes are not
diagnosed and they are not the same cause:

- **`check` spawns with a modified environment.** It now sets `HARNESS_LANE` and
  `HARNESS_AGENT`, and it sets `PORT` for the two gates that need its aux server;
  standalone, those gates get whatever the shell has.
- **`check` runs gates concurrently.** Four browser gates share four slots, so a
  gate that assumes a warm page or a quiet box sees neither.
- **`check` caches PASSes by tree sha**, so a standalone red on a tree whose gate
  cache says green means one of the two runs is wrong — and the cache never
  stores a FAIL, precisely so the red one is the one that gets re-derived.

Until it is diagnosed: **a red standalone gate is not evidence on its own.**
Re-run it inside `pnpm run check --no-cache --serial --only <gate>` before
believing it, and say which path produced the number when you quote it.

## `ps` RSS over a chromium tree double-counts, and is still the number to watch

`/health`'s `rssMb` sums the resident set of every process descended from a
chromium launched against the shared profile — browser, GPU process and every
renderer. Shared framework pages are counted once *per process*, so the total
overstates unique memory, by a lot when four contexts are live.

It is still the right instrument, because it is the only one that has ever
existed here: `project/TODO.md` says "1.4 GB", `project/STATUS.md` says
"~1.94 GB", and neither is attached to a measurement anybody can repeat. Use it
as a **trendline on one machine** — is this build worse than the last one — and
never as an absolute. First readings, for the record: **2 449 MB with one page
live, 16 465 MB across four.**

## The shared daemon used to die of one failed render, silently

`routeShots` claims every frame key in `inflight` before leasing a page, so a
second agent asking for the same frame waits instead of rendering it twice. Its
`finally` rejects any claim that never settled. In the common case **nothing is
awaiting that claim** — no second agent happened to want that frame in that
window — so the rejection was unhandled, and Node kills the process for that.

The process is the daemon that owns every browser on the machine. So one failed
render closed every context, and four other agents' tools died mid-`page.evaluate`
with **`Target page, context or browser has been closed`** — which reads at the
call site as the game crashing, and is the same string this file already records
costing two lanes an investigation each.

Fixed (`claim.catch(() => {})`, plus `unhandledRejection`/`uncaughtException`
logged and survived). What to keep from it:

- **That string almost never means the game crashed.** It means something closed
  the browser: a daemon restart from a `PROTOCOL` bump, a `pool.closeAll()`, an
  exclusive lease, or the daemon dying. Check **`~/.cache/ffxv-harness/<key>/daemon.log`**
  first — it exists now, and it is where the answer was.
- **It was invisible for as long as it existed** because autostart used
  `stdio: 'ignore'`. Any hazard in a detached process that writes nowhere is not
  rare, it is unobserved.

## `drawcheck`'s tolerance is smaller than its own reproducibility

`TOLERANCE = 8` (`drawcheck.mts`), and the gate does not reproduce to 8.

Measured three ways on 2026-08-27, all on **byte-identical game code**:

- two full `--capture` runs at one sha differ on 7 of 142 shots, six of them at
  exactly **-15** in one cluster (`menu_title`, `cine_opening`, and all four
  `dun_fociaugh_*`);
- nine archived manifests in `~/.cache/ffxv-harness/<key>/drawmanifest/`, mapped
  to their commits, have **zero** game-side files changed between consecutive
  pairs and disagree on **24 of 142**;
- `probes/posecost.mts` found 10 of 142 shots whose own two A/B/A arms disagree,
  `setpiece_deadeye` by **65**.

So the ratchet's slack is a third of the gate's noise. It has not cried wolf yet
only because the shots that swing are not near the flat 800 — the highest shot
carrying no debt entry is `poi_reststop` at **780**, which leaves **20 draws**
against a +15 excursion. A single commit that adds five draws there makes the
gate red for a reason nobody will be able to reproduce.

**Do not "fix" this by widening `TOLERANCE`** — that trades regression
sensitivity for false-red immunity 1:1, and the gate exists to catch drift of
exactly this size. The fix is to find what moves in ±15 steps. The clustering
is the clue: whole shot *families* move together, which points at one subsystem
toggling a fixed instance group rather than at noise.

## A gate with a cache of its own silently defeats `--no-cache`

`check.mts`'s gate cache keys on the tree sha and `--no-cache` bypasses it. But
`drawcheck` keeps a SECOND cache the suite knows nothing about — a whole-corpus
memo per sha in `drawmanifest/`. So:

    pnpm run check --no-cache      ->   drawcheck  PASS  0.3s

re-derived seventeen gates, served the eighteenth from storage, and reported
`18/18 in 94.5s` as a cold run. The one flag whose entire purpose is "re-derive
what this tree already has" was the one that did not, on the only gate expensive
enough for anyone to reach for it. Anyone re-checking a red drawcheck the
documented way was handed the answer it had already given.

`Gate.ownCacheFlag` fixes it, and `--set-baseline` defeats it too — a budget
recorded from a memo run would enshrine 0.3 s as the cost of 142 poses. **If you
give a tool a cache, tell `check.mts` how to turn it off.**

## A validation that excuses the population where the effect hides is not a validation

`countsOnly` ablated draw submission across the settle: **5.71x**, and
`probes/posecost.mts` A/B/A'd all 142 shots and reported **zero hard
mismatches**. It shipped. It was wrong.

The probe classified any disagreement as acceptable when the shot's own two FULL
arms also disagreed (`inSpread`). That is exactly the population a *systematic*
offset lives in: a shot that is noisy is also a shot where a real +15 looks like
noise. The test could not have detected the thing it was run to rule out, and it
ran no null arm and no `resetHistory()` — both of which this file already
requires.

The experiment that settles it is embarrassingly simpler: run the two paths on
**one sha** and diff the numbers.

    142 compared, 14 differ     prompto_closeup  498 -> 518  (+20)
    tolerance is 8              poi_reststop     780 -> 795  (+15)

**When an optimisation is validated by a statistic rather than by a diff, ask
what the statistic forgives.** Reverted; the settle is drawn again.

### The same shape, in a gate: `uxcheck` exempted the Regalia

**2026-08-30.** `uxcheck.mts` section 8 asks "is any key claimed by two systems
in the same mode". It carried

    // Driving and on-foot combat are mutually exclusive states, so a key may
    // be in both.
    if (owners.has('regalia') && owners.size === 2 && !owners.has('menus')) continue;

and passed green for as long as it has existed over **four live collisions**:
V was lock-on and the drive camera, T drew elemental energy and fitted the
Type-D package, B cast the third Elemancy slot and changed radio station, F
swung the heavy attack and got you out of the car.

**Driving is not a mode.** `CombatSystem.update` gates `_readInput` on
`input.enabled` and its own `scenarioLock`; nothing in the tree sets either
when the player gets into the car, and `isDriving` has three readers, all UI.
The comment asserted a modality the code never implemented, and the exemption
built on it removed from the search exactly the pair of systems the defect
lived between.

Two further details generalise.

- **`Space` was not even in the pattern** (`Key[A-Z]|Digit\d|Backquote`), so
  the one collision here a player can *see* — handbrake and dodge roll on the
  same key, `state: idle -> dodge` while driving — could not be represented at
  all. A gate's alphabet is part of its coverage.
- **Outcomes are conditional; count the calls.** The probe that settled it
  (`src/tools/_probe/inputcollide.mts`) wraps the combat verbs and counts
  invocations, because `setLockOn(autoTarget())` with no enemy nearby changes
  nothing observable and the first version of the probe read that as "no
  collision". Five presses, five verbs, one call each.

**How it ended, which is the part worth copying.** The first fix was
`SHARED_ON_PURPOSE`, a per-key allowlist where each entry carried the reason it
was allowed — right while the mode did not exist, because a category can absorb
a new defect silently and a named key cannot. Then `CombatSystem.update` got
the one line that actually implements the mode (`da4530c`, skip `_readInput`
while `Regalia.isDriving`), and at that point the allowlist became the same act
of faith with more names on it. So the modal exemption is back — **and it is
now earned by a measurement that runs inside the same gate.** `uxcheck` section
7.5 drives the car, presses the shared keys, asserts no combat verb answers,
then gets out and asserts every one of them does; section 8's exemption is
documented as licensed by that pair, so if 7.5 goes red the exemption is void.

    PASS  combat does not read the keyboard while driving   -- 0 calls
    PASS  and every one of those verbs still fires on foot  -- 5/5

**The second assertion is the one that earns its keep, and it generalises to
every mode guard anyone writes here.** A guard is one `&&` away from switching
the system off altogether, and "no verb fired in the guarded state" is exactly
what the first assertion wants to see: the widest possible guard scores a
perfect green on it. Any check of the form "X is suppressed in state S" needs
its partner, "and X still happens outside S", or it is not a check.

### And the same shape in `regaliadrive`: `Math.abs` is an exemption too

The mirrored-steering bug (a human found it in a minute; 19 gates, 142 shots
and both perf gates did not) survived because `regaliadrive`'s steering
assertion was `Math.abs(h1 - h0) > 0.3`. That predicate is **symmetric under
negation of `steer` by construction**: there is no car it can tell apart from
its own mirror image. Section 2b now drives `KeyA` *and* `KeyD`, requires
opposite signs, and measures the **path** — travel direction from world
positions, accumulated so it cannot wrap — rather than `body.heading`, which is
the quantity the bug lived in. `src/tools/_probe/steerfalsify.mts` negates
`c.steer` and shows the gate goes red, which is the check a new gate owes.

## A shared constant across unrelated subjects is a thing, not noise

`drawcheck` disagreed with itself on 25 of 142 shots and I spent five hypotheses
treating that as variance — frame parity, chunk sizing, boots, accumulated
state, reset drift. Four were falsified and the fifth only half explained it.

What actually broke it open was reading the deltas instead of their spread:

    storm, town_diner, vista_dawn, vista_dusk, vista_night,
    zone_callaegh, zone_cape_caem, zone_lestallum      all exactly +15
    setpiece_deadeye                                          -60 = 4 x 15

Nine unrelated shots do not land on the same constant by chance. **A quantum
means presence or absence, and presence or absence means a discrete thing you
can go and find.** It was `Enemies.prototype()`, which builds a species'
geometry on first spawn and caches it forever, so a draw count was a function of
run history. `System.warmup()` builds them all up front and moves
`setpiece_deadeye` 574 → 514 — the -60, exactly.

Before modelling disagreement as noise, **histogram it**. If the deltas cluster
on a value, stop doing statistics and go find the object.

## Check whether a field is stored or computed before believing it leaked

`src/tools/resetcheck.mts` reported `weather.windStrength` surviving a reset and
I called it the cross-shot accumulator behind `drawcheck`'s noise. It is not.
`_gust` **is** zeroed — `resetClock()` calls `snap()`, which does it — and
`windStrength` is recomputed from `_gust` on every update, so it reads stale for
exactly as long as it takes one frame to run, and clears itself.

`menus.open` is the same shape and *was* real: derived from the open amount `a`,
which nothing reset, so it read true forever after. The lesson is not "derived
fields are false positives" — it is that a digest must read **the field that
holds the state**, or it will report the shadow and miss the object. Both were
found by the same tool on the same run, one true and one false.

## A content-addressed cache is only as honest as its dependency list

The gate cache keys each gate on the bytes it reads, which is what took a docs
commit from 309 s to 8.2 s. The first version hashed the gate's own `.mts`, plus
`harness.mts` and `daemon.mts` for browser gates. It missed a file.

`reachcheck`'s instrument is `src/tools/_reach/instrument.mts`, and reachcheck
does not import it — it **reads it and injects the source into the page**:

    const src = await readFile(path.join(ROOT, 'src/tools/_reach/instrument.mts'), 'utf8');

So rewriting that instrument — a 46.3 s → 35.2 s change to the code that
produces the verdict — moved no key, and the next `check` reported **18/18 in
0.2 s, all from cache**: a verdict about code that no longer existed. The
speedup was real and the confirmation was worthless.

The key now follows a gate's transitive tool closure through **both** relative
`import` specifiers and `'src/tools/…​.mts'` path literals, because reading a
file and injecting it is a standing pattern in this harness (probes, drivers,
`_reach`, `_probe`), not a one-off.

**The general shape: a cache keyed on "what it reads" is a claim about what it
reads, and an unlisted dependency is not a slow cache, it is a wrong answer
delivered instantly.** When you narrow a cache key, write the test that edits
each dependency and asserts the key moved — `scratchpad/keytest` does this in
eight arms and caught this one.

## A red gate is not a broken harness, and a ledger that conflates them lies

The daemon's ledger recorded `verdict: 'error'` for a job that faulted **and**
for a gate that ran perfectly and returned FAIL. Over the first evening of
ledger that read as **80 errors in 1818 jobs — 4.5%**, which looks like a
harness falling apart. Decomposed, it was:

    28  a gate saying no (FAIL / VOID / BUSY) -- the suite working
    40  a `tool:` row echoing the child job that had already been counted
    12  genuine faults -- 0.66%

and **nine of the twelve fall between 17:22 and 17:49**, the window in which
`PROTOCOL` went 5 → 6. Bumping `PROTOCOL` restarts the daemon and a restart
closes every leased page, so `page.evaluate: Target page, context or browser has
been closed` is that landmine's signature, not a new one.

`verdict` is now `ok | fail | void | busy | error | deadline`, and
`harnessstats` prints the fault rate and the red-verdict count on separate
lines, because they answer different questions: **`error` says whether the
HARNESS is healthy; `fail` says whether the TREE is.**

**The general shape:** an instrument that folds "the thing I measured is bad"
into "I could not measure" produces a number nobody can act on. This repo
already learnt it once at a finer grain — `VOID` exists in `check.mts` for
exactly this reason, and `drawcheck` VOIDs rather than passing when it cannot
read the budget out of `BRIEF.md`. The ledger simply had not been given the same
vocabulary. When you add a verdict field, enumerate the *kinds* of not-ok before
you write the first row; retrofitting leaves a history you cannot re-read.

## `converge()` does not replace the boot prime, and the difference is 13/255

`Vegetation.init` primes grass, scrub and trees around the ORIGIN so the first
rendered frame is dressed — `prime.bushes` 450 ms, `prime.grass` 119 ms,
`prime.trees` 43 ms, **about 610 ms of a 6.5 s boot**, and the suite takes 188
cold boots per cycle.

Under `?shoot` that looks like pure waste. A posed page boots, `applyShot` moves
the camera elsewhere, and `Game.settle` calls `converge()` on its first frame,
which streams all three to completion *at the shot camera*. Everything primed at
the origin is discarded before a frame is photographed. Skipping it under shoot
mode takes Vegetation from 1216 ms to 688 ms and the cold boot from 6.54 s to
6.15 s.

**It also changes the picture, and not subtly.** Five shots, PNG, against their
own measured per-shot floors:

    vista_dawn       0.459/255      under floor
    zone_lestallum   0.250/255      under floor
    poi_reststop     0.087/255      under floor
    town_wide        0.509/255      under floor
    hero_full       13.359/255      floor 2.25, 31.7% of pixels over 8/255

`hero_full` is the shot at the origin — the one place the prime and the converge
target the same tiles — and it is the one that broke. So `converge()` is not
equivalent to `update()` run 60 times at the same point: the streamers spend a
per-update wall-clock budget and what ends up resident differs, which is the
same order-dependence `converge()`'s own comment describes. Converging to
"finished" is not the same state as sixty budgeted updates.

**Reverted.** Recorded because it is the most attractive-looking boot saving in
the profile: 610 ms, obviously redundant on the reasoning, and wrong. If it is
retried, `hero_full` is the shot that catches it, and it must be a PNG diff
against the per-shot floor — the four shots that pass tell you nothing.

## A CSS effect that computes correctly and renders nothing, for a year

`Menus.lateUpdate` has written `backdrop-filter: blur(26px) saturate(.58)
brightness(.54)` onto `.menu-scrim` since the menus were built. `getComputedStyle`
returns exactly that string. **It has never rendered.** Every menu capture this
repo has ever taken shows the world sharp behind the reading column — the party
walking crisply through the middle of the Elemancy screen — and it was read six
times as "the menu screens have no scrim", which is a layout problem and would
have been fixed by adding panels the design does not want.

`backdrop-filter` samples the backdrop of the element's **own compositing
layer**. `.menu-scrim` sits inside `#menus` (`position: absolute; z-index: 2`);
its backdrop is whatever `#menus` painted beneath it, which is nothing, while
the game canvas is a different layer entirely. The filter runs against an empty
backdrop and produces nothing, with no warning anywhere.

Six arms at one held pose, blur only with the gradient removed, PNG bytes as the
proxy for how much detail survives (`src/tools/_probe/scrimfix2.mts`):

| arm | PNG |
|---|---:|
| as shipped (`position: absolute` inside `#menus`) | 3.08 MB |
| scrim `position: fixed` | 3.08 MB |
| scrim `will-change: backdrop-filter` | 3.08 MB |
| scrim `transform: translateZ(0)` | 3.08 MB |
| `#menus` `position: fixed` | 3.08 MB |
| **scrim re-homed into `uiRoot`** | **0.51 MB** |

Only re-homing works. Promoting the element does not, and neither does promoting
its parent — so this is about which layer's backdrop the filter can reach, not
about whether the scrim is composited.

**Three things generalise.**

1. **A computed style is not a rendered pixel.** `getComputedStyle` said the
   blur was on, every time it was asked, for as long as the bug existed. The
   only instrument that could see the truth was a screenshot with a control
   beside it: the same declaration on an element in a different parent.
2. **A silent visual no-op reads as a design decision.** Five screens looked
   under-designed and one (`controls`, which draws real dark cards) looked
   finished. The obvious reading — "the other five need panels" — was wrong and
   would have shipped panels over a blur that was already specified.
3. **`window.__shot` in a probe is async and must be awaited.** Called without
   `await`, the body runs on and every shot is taken after it returns, so all
   the arms photograph the same frame. That artifact produced two confident
   wrong conclusions here — "the scrim does not paint at all" (it was painting;
   the red test was photographed after the red was removed) and "the grain's
   `mix-blend-mode` isolates it" — before anyone noticed the frames were
   identical. An A/B whose arms are byte-identical is not a null result, it is a
   broken harness.

## A `follow:` shot ignores `setShot`, so a re-framing that changes nothing is not a bad frame

Five attempts to re-frame Titan produced **ten byte-identical vantages** and were
read as five bad choices. The camera never moved. `follow:` shots set
`CameraRig.followShot`, which **overwrites `setShot` every frame**, so any
`setShot` a probe or a `Shots.ts` entry applies to one of the 47 `follow` shots
is silently discarded on the next tick. Check which kind of shot you are framing
before concluding a vantage is wrong: byte-identical output from two different
camera positions is the signature.

## The shared working tree must stay parseable between edits, not only at commit

The `dirty:` build serves the **shared** working tree, so a file left
half-written across several tool calls stops **every** lane on the machine from
capturing — the page does not boot, and the symptom at the other end is a capture
timeout, not a syntax error. On 2026-08-28 this happened twice in one day (both
times a backtick inside a `/* glsl */` template literal) and cost one lane the
end of its session: it had a finished, measured fix, could not get a frame to
look at it, and correctly refused to ship a change it had not seen.

`npx tsc --noEmit -p tsconfig.json` takes seconds. If a refactor cannot be
finished quickly, park your own file and leave the tree green.

## A consistently-but-inversely wound shell is invisible to every bench in this repo

**2026-08-28, and it cost five lanes.** `buildHead`'s skull grid had `u`
increasing with `+x` at the front and `v` with `−y`, so every quad's geometric
normal was `−ẑ` — pointing *into* the head. With the face material at
`FrontSide` the near surface was backface-culled in **every frame this repo has
ever captured**, and what drew was the **inside of the far side of the skull**,
with the lids, lashes, ears and hair — built by `blob`/`ribbon`/`buildLid`, all
correctly wound — floating in front of it.

**Read the judge's own sentences against that mechanism.** An inside-out occiput
*is* "an egg". The eyes *are* "stuck in front of it", because they are separate
meshes. The mouth is missing because it is on the culled surface. And *"the chin
projects further forward than the nose"* is exact: the lowest forward point of
the inside of a braincase **is** where a chin would be. Four rounds of judging
described this correctly and every reader took it as a sculpting complaint.

**Why five passes of measurement agreed while the picture did not — this is the
transferable part.** Every bench here reads the **position** buffer, and the
positions were always right. `headprop`, `facecheck`'s geometry rows, `geocheck`,
`seatcheck`, `silhouette` and the whole `probes/` family measure where vertices
*are*, never which way a face points. A silhouette is the same surface either way
round, so even the profile looked plausible. **If a metric agrees and the frame
disagrees, suspect a property no metric in the tree reads** — and winding is the
one this repo demonstrably did not read.

**`assertConsistentWinding` does not catch it, by construction.** Edge parity is
orientation-*relative*: a shell that is uniformly wrong is uniformly consistent,
and passes. The check has to be **orientation-absolute**.
`src/tools/probes/facewind.mts` is that check — geometric normal of the
front-most triangles, plus signed volume per mesh. It read **0.0% outward before,
100.0% after**; the mesh's max-z vertex, the nose tip at `uv = (0.500, 0.372)`,
carried `n = (0.01, 0.35, −0.94)`.

**The `DoubleSide` → `FrontSide` fix recorded above did not cause this; it
revealed it.** While the material was `DoubleSide` the inverted grid still drew,
so the head looked whole and merely wrong. Moving to `FrontSide` was correct and
is what made the defect visible as a missing surface. Expect the same order of
events anywhere else `DoubleSide` is masking geometry: **fixing the material is
step one, and step two is checking the winding it was hiding.**

## `renderer.compile()` builds a different program than the frame draws, unless you make it match

Two conditions, each worth about sixty shader programs of the 271 this page
used to hold, and neither visible in a program *count*.

- **A material compiled before it is patched is dead the moment it is patched.**
  `Game.init()` runs `renderer.compile(scene, camera)` and one warm
  `post.render()` before `PostFX.precompile()` builds `Warmup`, and
  `Warmup._patchAll()` is where `MaterialPatch.scan` runs. Every lit material
  visible at that moment compiled with no CSM defines and no `atmo1|` key; the
  patch then set `needsUpdate` and three compiled it again. Sixty programs,
  `usedTimes` 234, bound by no frame in the corpus.
- **three keys TWO fields on `_currentRenderTarget === null`** —
  `outputColorSpace` and `toneMapping` — and both are in the program cache key.
  This game renders every scene pixel through `EffectComposer`, which owns a
  target, so a compile with no target bound builds the *canvas* twin of every
  material in the scene and nothing ever binds one. Eighty-five programs.

`src/engine/CompileGuard.ts` wraps the renderer so both are true of every
caller: **a compile sees what a frame sees.** Do not put this back in the call
sites; there are four of them and `Game.ts` is shared.

**The measurement that separates waste from content is `gl.useProgram`, not the
count.** 271 programs might be 271 different surfaces. `probes/progused.mts`
hooks the bind and poses twelve shots: 134 programs are ever bound, and of
those exactly one is canvas flavour.

## Do not parse three's program `cacheKey` from the end

It looks like you can: the tail is fixed-length — 48 scalar parameters, two
boolean bitmasks, `outputColorSpace`, `customProgramCacheKey` — and the head is
the shaderID plus `name,value` per `#define`. But three's **default**
`customProgramCacheKey` is `this.onBeforeCompile.toString()`, and a stringified
function is full of commas. That misparsed **44 of 271** rows and produced a
confident phantom — "srgb splits every material, 103 against 124" — that
survived being cross-tabbed against three other fields. Anchor **forward** on
the GLSL precision qualifier, which is the tail's first token
(`probes/progkeys.mts`).

**And a cache-key field cannot be read one at a time.** Held alone,
`outputColorSpace` collapses 4 programs and `toneMapping` 1. They are two
readings of one condition, and held together they collapse 85 of 211. An
inventory that varies one field at a time walks straight past a pair.

## A GLSL compile or link failure is invisible on a warm page, and the pre-commit hook cannot see it either

**2026-08-28: the river water surface was not drawn at all for a whole day**, in
every frame, and every gate stayed green. One line of a fragment shader:

```glsl
vec3  body = (bed * Tr + uScatter * (1.0 - Tr)) * downwelling;   // line 167
float body = smoothstep(0.02, 0.55, depth);                      // line 223
```

Same scope, same name — `ERROR: 0:335: 'body' : redefinition`. The fragment
shader never compiled, `riverWater`'s program never linked, and the pale strip in
every river frame was the **bank decal alone**.

**Why nothing caught it.** A program is compiled once per page, and the daemon
clears a slot's errors per run — so the failure is charged to whichever run
happened to cold-boot that page, and every warm capture after it is silent.
**Only `--cold` can see this class of fault.** The pre-commit hook builds; it does
not link GLSL, so it cannot see it either. **After any shader edit, take one cold
capture.** It is the only oracle.

**Two false leads, both measured.** The sampler budget was not involved. And
`VALIDATE_STATUS false` on a *linked* program means nothing here — about **120 of
271** programs report it, because that is what `validateProgram` says when called
outside a draw. **Only `LINK_STATUS === false` is real.** Find the material with
`renderer.info.programs` plus `LINK_STATUS`, not with `material.program`, which
is `undefined` in three 0.185 — that is why `probes/samplercount.mts` returned an
empty list.

**`shoot.mts` was throwing the diagnosis away.** It printed `e.split('\n')[0]`,
which for a shader failure is the one useless line, while the `Material Name:`
and `ERROR: 0:335:` that follow were captured and discarded. It prints the
diagnostic lines now.

## A pre-commit hook that builds the working tree does not prove the commit builds

`0560b83` swept another lane's in-flight `src/world/Water.ts` into its own commit.
Nothing was lost, but that commit's tree imports `./water/Tarns.ts`, which did not
exist in it — **so the commit does not build**, while its pre-commit passed,
because the hook builds the *working tree* rather than the tree the commit
creates. On a shared trunk those are different objects.

This is the shared-index hazard `CLAUDE.md` warns about, seen from the other
side: the damage is not only to the lane whose work is swept, it is a broken
commit in the history under someone else's name. **Commit with an explicit
pathspec, always, and never let a pathspec widen to a directory another lane is
editing.**

## Piping `daemon.mts --wait` throws its exit code away, and that is how a perf number gets taken on a busy box

**This entry replaced a wrong one, and the correction is the useful part.** It
used to say *"`--wait` exits 0 when it gives up"*. **That is false and was false
when it was written.** `daemon.mts` ends its wait with
`else { console.log(\`[daemon] gave up after ${secs} s — ${r.why}\`); process.exit(1); }`,
and has since `42c4dce` on 2026-08-27 — about nineteen hours *before* the entry
claiming otherwise was committed. The tool was right; the entry blamed it.

**What actually happens** is that the exit code is real and then discarded by the
caller. Every invocation in this repo's transcripts looks like

    node src/tools/daemon.mts --wait quiet --for 900 2>&1 | tail -3 && node src/tools/perf.mts …

and **a pipeline's exit status is the status of its *last* command**, which is
`tail`, which succeeds. So `&&` runs, the perf number is taken on a 4/4-busy box
at load 9.24, and nothing anywhere says so. The give-up line scrolls past in the
`tail` output and reads like progress.

**Do not pipe a wait you are branching on.** Either let it exit into the `&&`
directly, or capture it and test:

    node src/tools/daemon.mts --wait quiet --for 900 || { echo "still busy"; exit 1; }

`set -o pipefail` also fixes it, and is not on by default in these shells.

**Why it matters where it matters:** `perf`, `gameplay`, `bootprof` and `bench`
take the exclusive lease and are meaningless under contention. **A perf number
taken after a wait that timed out is void**, and only some tools will tell you —
`perf.mts` stamps `RULER_VALID` and `VERDICT:`, but a probe that prints no
verdict line at all gives you a number with no way to tell. `perfmenurepro` read
**938 ms and 14 hitches** on a busy box and **0, max 14 ms** alone on a quiet
tree.

**The separate, real complaint about `--wait` itself**, from `perf-r4`: chained
with `&&` it will sit for the *full* N while other lanes shoot, because the
condition it waits for is one those lanes keep breaking. That is a latency
problem, not a correctness one, and it is why a long `--for` on a shared box is
often worse than queueing behind the scheduler.


## An explicit pathspec commits the FILE, not your hunks — which is why shared documents still get swept

`CLAUDE.md`'s rule is `git commit -- path/a path/b`, and it is the right rule: it
stops `git add -A` snapshotting the shared index. **It does not stop you
committing another lane's uncommitted changes to a file you both edit.** A
pathspec selects paths, not diff hunks, so every unstaged change in that file
goes in under your message.

**Three lanes hit this on 2026-08-28**, in two different shapes:

- **A shared document.** `7120d7f` carried 28 lines of another lane's complete
  WS-6 rewrite of the backlog plan. Nothing was lost or half-written, but the
  commit message describes none of it, and the attribution is wrong for good.
  `docs/plans/*.md`, `project/LANDMINES.md` and `project/STATUS.md` are the files
  every lane edits — **run `git diff <path>` before committing one.**
- **A source file mid-refactor.** `0560b83` swept a lane's in-flight
  `src/world/Water.ts`, and the resulting tree imports a file that did not exist
  in it, **so that commit does not build** — while its pre-commit passed, because
  the hook builds the *working tree*, not the tree the commit creates. On a
  shared trunk those are different objects.

And the same distinction from a third angle: **`git commit -- <pathspec>` is not
a build gate on what you committed.** `911f99d` committed a call site without its
callee and passed for exactly that reason.

**The habit that works:** `git diff <path>` immediately before the commit, every
time, on any file another lane could be in. If hunks you did not write are there,
either name them in your message or wait. On a document, waiting is usually
right — the other lane is seconds from committing it themselves.


## A probe that reads `Terrain.drawnHeightAt(x, z)` with no `cell` measures where the camera is parked, and the error grows with distance from it

`drawnHeightAt`'s third argument is the ring spacing to model, and **omitting it
does not mean "the true surface"** — it means "the highest ring that covers this
point given where the clipmap is standing right now". A probe that poses no shot
leaves the clipmap wherever boot left it, so every subject is measured against a
lattice chosen by an accident of the harness, and the coarser that lattice the
deeper the bilinear chord sags below the relief. `Terrain`'s own docstring prices
it: **~0.37 m inside 144 m, 16 m at 1.2 km**.

The failure mode is the nasty one, because it is **monotone in radius**: widen
your sweep and the new subjects are all further from the parked camera, so they
all read worse, and the result looks exactly like *"the far half of the world is
broken"*. `probes/outcropjoint.mts` reported **1 floating of 2548** over a
1 760 m sweep and **34 of 5488** over 2 464 m, and 33 of the 34 were the
instrument. The worst of them: a block at (2366, −211) seated at y 161.6 with the
analytic field at 163.4 and an uncelled `drawnHeightAt` at **135.4** — a 28 m
disagreement on ground whose slope is 0.179.

**The rule, and it is already written down in the code the probe was grading.**
`Rocks`' `CULL` docstring says: *"it cannot be the live camera's spacing: a rock
6 km from spawn is under the coarsest ring in the stack at build time and that
has nothing to do with how it will be seen."* Every prop in this repo is seated
against `terrain.clipSpacingForDistance(<the range it is culled at>)` — the
finest ring it will ever be seen over. **Read its support on the same lattice**,
or the two numbers are not comparable and the difference between them is the
harness.

With the lattice pinned, the rate stops depending on the radius, which is the
property a rate is supposed to have: 4 of 2866 (0.14 %) at 1 760 m, 8 of 5490
(0.15 %) at 2 464 m.

Same shape as the `hullExtents` finding one file over — a gate composing through
the same quantity it grades — and the same cure: **the instrument must not share
a coordinate system with the thing it is measuring by accident.**

## `await` between boot phases is a microtask, so the whole boot is one task

**Everybody who read `Game.init()` assumed the `await` in its phase loop gave the
browser a chance to paint. It never did, for the life of this project.**

```ts
for (const { name, boot } of order) { p(...); const sys = boot(); await sys.init(this); }
```

`await` on a promise that is **already settled** — which most of these are, and
which every synchronous `init()` returning `undefined` is — schedules a
**microtask**. The microtask queue drains at the end of the *current* task, so
control never returns to the event loop and there is no rendering opportunity
between iterations. Twenty-six systems and eight seconds of work are **one task**.

Measured (`src/tools/coldload.mts --prod`, before the fix): the `longtask`
observer saw **two** entries for an entire 8.4 s first visit and the worst was
**7961 ms**. The browser got 43 frames in 8.5 s where a responsive page would get
~511, and 96% of the load could not paint or take a click. `docs/BOOT_PERF.md`
had the mechanism written down from the code as *"`await` yields between phases,
but a phase that runs 400 ms blocks for 400 ms"*; the second half was right and
the first half was fiction.

**The cure is a real task, and `Game.yieldToBrowser()` is the one spelling.** A
`MessageChannel` `postMessage` is a genuine task. Not `setTimeout(0)`: nested
timeouts clamp to 4 ms after five levels, ~100 ms of pure clamp across this boot
— and that clamp is the same one that produced the 12–35% frame-time tail
recorded further up this file. Measured after: **14** long tasks, worst
**1243 ms**, and the boot wall clock did not move (8.90/8.48/8.28 s before,
8.84/8.39/8.42 s after, back to back on the same box).

**Two corollaries, both non-obvious.**

- **A loading screen cannot be rescued by CSS alone.** `#boot .bar i` animates
  `right` with a CSS transition, which is *not* a compositor property, so it
  repaints on exactly the main thread the boot is holding. "Make it CSS-animated"
  only works for `transform` and `opacity`.
- **No gate in this repo could see any of it.** All nineteen start from a page
  that has already booted. `bootprof` times `Game.init()` from inside the page,
  and a wall clock measured *by* the blocked thread cannot tell a busy thread
  from a frozen one. The `bootblock` gate (`coldload --gate`, in `check --perf`)
  asserts on the **count** of blocks, not their duration, because a count is the
  half that contention cannot move.

## An idle tab at 100% of a core is not necessarily a leak

The reflex diagnosis for a pinned idle tab is a runaway timer, a microtask storm
or a streaming loop that never reports converged. **Here it was none of those,
and the discriminator is one arm of one tool.**

`src/tools/idlecpu.mts` runs A/B/A over `running -> stopped -> running`, where
`stopped` is `Game.stop()` — which cancels the rAF loop **and nothing else**: the
page, the world, the GL context and every timer survive. Idle cost went from
**168–181% of a core to 2.4%**. That single arm eliminates every timer-shaped
hypothesis in fifteen seconds, and it is cheaper than any profile.

What was left is the loop itself: `Game.frame()` draws a full post-processed
frame every tick whether or not anything moved, `post.render` is 74–77% of it,
and the world is never actually static (day cycle, water, wind, TAA), so
render-on-demand is not available without changing how the game looks.

**Two traps in measuring this at all.**

- **Headless does not vsync.** It free-ran at ~102 fps, so the raw percentage is
  what the loop costs when *nothing* caps it, not what a person pays. The figure
  that transfers is **CPU ms per frame × the display's refresh** — 16.5 ms/frame
  is 99% of a core at 60 Hz and 198% at 120 Hz.
- **Headless reports `devicePixelRatio` 1.** A Retina panel reports 2 and
  `Renderer.ts` asks for `min(dpr, 1.5)` at `q=high` — **2.25× the pixels**. A
  headless percentage *understates* a laptop. `idlecpu --dpr 1.5` measures it
  rather than arguing about it.

And `performance.memory` is not the only frozen in-page oracle: **nothing inside
the page can see its own CPU.** `SystemInfo.getProcessInfo` over a browser-level
CDP session is the only oracle that sees the GPU process, and the GPU process is
half the number.

## Do not diff the corpus across a *span* on this trunk — diff each commit against its own parent

Every agent shares one trunk, and the trunk moves fast: **277 commits landed
between the `confluence` lane opening and its own three going in**. Diffing the
corpus across that span — the natural "before and after my work" — returned
`hero_full` at a mean of **47.2/255 with 87.5% of pixels over 8/255**, and
`vista_noon`, `regalia_road`, `zone_longwythe` and `zone_vannath` all in the
tens. **None of it was that lane's.** It was other lanes' vegetation, water-mask
and grass-density work, arriving in the same window.

A number that size is not ambiguous-looking; it looks like a catastrophe you
caused, and the reflex is to start reverting. The correct control is one
capture pair **per commit, against that commit's own parent**:

    node src/tools/shoot.mts <shots> --build <sha>^ --cold --out tmp/shots/a
    node src/tools/shoot.mts <shots> --build <sha>  --cold --out tmp/shots/b
    node src/tools/imgdiff.mts tmp/shots/a tmp/shots/b

Taken that way the same four shots came back **0 of 4 over their own cold floor,
twice** — and the two commits' columns agreed to three decimals, which is itself
the tell that the residual is boot-to-boot TAA rather than anything either
commit did. Cold on both sides, always: `--cold` is what makes the floors the
measured cold floors.

## An instrument that re-derives the code's own arithmetic cannot notice the code changing

`probes/fishdeck.mts` was written to answer "how far above its own bank does a
fishing camp stand", and it answered it by recomputing `_fishing`'s own
`deck = max(1.4, water.level + 1.5 - base)` and adding the offsets the kit uses.
That was correct on the day it was written. `b648b69` then split the bank out of
the deck — and the probe went on printing **4.6–5.3 m of shack float that no
longer existed**, for two lanes, with no symptom at all. Its numbers were
internally consistent, plausible, and describing a version of the code that had
been replaced.

The rule that falls out: **a probe measures the geometry that was built, not the
formula that built it.** Walk `pk.built`, read `geometry.attributes.position`
through `matrixWorld`, and compare against the world. A probe written that way
cannot silently describe a dead branch, and the same rewrite immediately found
two defects the arithmetic version was structurally unable to see — that all four
tarn camps stood entirely over water and all four sea camps entirely over land.

**And the second half of that rewrite has its own trap.** Dropping every vertex
into a 2 m cell and judging each cell by its own lowest vertex reports **every
overhang as a float**: a roof eave stands 0.4 m outside the shack it is nailed
to, so the cell under the eave holds nothing but roof and reads 2.5 m of air.
That produced a confident 2.8–4.1 m "proud" reading on camps whose every piece
was individually seated. A cell is supported by the lowest thing within one cell
of it in each direction; a structure genuinely in the air still has nothing under
any of it, which is the case the probe exists for.

## `gradePad` at a brink builds a WALL, so a toe probe cannot see the pad that fails

`probes/padhang.mts` measures an apron's outer ring against the drawn ground and
is the right instrument for a pad that stops in mid air. It is **blind to the
other failure of the same code**, and the blindness is structural rather than a
tuning matter.

`Wear.gradePad` has a `cliff` branch. On a bearing where the ground falls faster
than fill can stand, it does not hang a batter — it builds a kerb and then a
**retaining wall straight down to the ground the bearing measured, capped at
26 m**. A wall *lands*. So `hang` is happy, `toeMean` is happy, `floatcheck` is
happy, and what is in the frame is a twenty-six-metre curtain of pale striated
fill plastered flat across a dark rock cliff — which is exactly the composition
`FILL_MAX`'s own docstring says it exists to prevent, arriving through the branch
that fires when `FILL_MAX` is exceeded.

This cost a full move-and-look cycle on `tomb_fierce`: a seat chosen on hang
(22.0 → +0.24 m) and footprint relief (72 → 24 m) turned out to be the worst of
the four candidates once looked at. **The number that sees it is how far the
earthwork falls below its own deck** — the minimum `y` over every vertex of the
apron mesh, against the group's origin. At the pretty seat it read `26.0`, the
cap; forty metres further on it read `2.6`. `tmp/probes/poiseat.mts` ranks
candidate seats on both, and a seat is only good when hang ≈ 0 **and** that
number is small.

Corollary worth stating on its own: `padhang`'s `over0`/`meanToe` improving is
not evidence that any pad looks better. Capture and look.

## A fishing pin cannot be moved off its own pond, because the pond is defined from the pin

`Tarns.findTarns` walks `worldMap.poisOfType('fishing')` and fits a basin
**centred on each pin**, out to a 105 m disc. So every tarn pin is in the middle
of its own water by construction, and "move the pin to the bank" is not an
available fix — the bank moves with it. Four fishing camps stood entirely over
their own tarn for exactly this reason, and the fix had to be in the kit: it
finds its waterline and lays itself out from there, up to 80 m from the pin.

The same shape will bite anything else that derives world content from a POI
position and is then asked to reposition that POI.

## An attribute is packable when it is spent on how a surface LOOKS, never on where it IS

`aClip` looked like the safest row in `AttrPack`'s `RULES` table: two
components, every value already inside 0..1, no range check refuses it, 1.6 MB
for free. It is the terrain clipmap's **LOD morph alpha**, and
`TerrainMaterial.ts:220-232` spends it as

    tfH = mix(tfH, mix(mix(h00,h10,gt.x), mix(h01,h11,gt.x), gt.y), aClip.x);
    ...
    vec3 transformed = vec3(position.x, tfH, position.z);

One byte of alpha is one byte of **height** on every clipmap ring in the world.
Quantising it put `driftcheck` at 0.45 m against a 0.05 m tolerance and can
never satisfy `heightcheck`, which asserts *0.000 m* GPU vs CPU.

The rule that survives: **read the shader that consumes an attribute, not the
attribute's measured range.** An `a`-prefixed name tells you nothing. `aMat`
(roughness, metalness, thickness), `aTan`/`aGroom` (hair directions), `color`
(a tint) and `skinWeight` (a partition of 1) are all shading and all pack
safely; `aClip` is geometry wearing a shading name.

**And the reason this is a landmine rather than a bug report:** a 1/255 error in
a morph alpha is far under every per-shot `imgdiff` floor in this repo. Thirteen
frames compared and four read by eye could not have caught it, and did not. One
numeric gate did. That is the argument for `heightcheck` asserting exactly
0.000 — and the same shape as "a consistently-but-inversely wound shell is
invisible to every bench in this repo". Found 2026-08-30, reverted in `50b66b1`.

## Two cloud instruments were lying, in the two ways instruments in this repo lie

Both found 2026-08-30 by lane 4, and both are the house pattern: **when a metric
agrees and the frame disagrees, suspect a property no metric in the tree reads.**

**An ablation token that is overwritten after it is applied.** `?post=nocloudsun`
and `?post=nocloudamb` were silently dead: `_ablateWeather` runs only from
`_pushWeatherUniforms`, and `_applyTimeOfDay` rewrites both uniforms *after* it.
The token parsed, the flag set, the frame did not change. **Every measurement
ever taken through those two tokens is suspect** — including the one that
justified `uAmbientBoost` 1.15 -> 4.00. An ablation that matches nothing is an
error; an ablation that is *undone* one call later looks exactly like a
measured negative.

**A classifier whose class boundary moves with the thing under test.**
`cloudstat.mts` split cloud from sky by *luminance*. Every task-17 lever darkens
the shadow side of a cloud — which pushes the pixels under test out of the
cloud class, so the tool reported `uCloudMS` 0.62 -> 0.34 as a **regression**
when it was two thirds of the win. Split on saturation instead. Any classifier
keyed on the same channel the change moves will report the change as its own
absence.

## Eight lanes each running the full suite spend more time queueing than working

Measured 2026-08-30 during the first eight-lane wave, from `harnessstats`:

    543 jobs  ·  waited 291.4m  ·  ran 507.0m  ·  36% of it was queue
    lease    116 jobs  p90 queue 2.9m   worst 13.9m
    prewarm   40 jobs  p90 queue 8.4m   worst 14.2m

with **25 concurrent `check.mts` processes** against a daemon worker budget of
**4**. Three separate lanes reported a `pnpm run check` that never returned
inside a three-hour window; none of them had failed, all were queued. `reachcheck`
alone burned 33.8 minutes across seven runs.

The suite is not the problem — the *fan-in* is. Nineteen gates want the same four
browser workers, and every extra copy also evicts the warm pages the others are
using, so the marginal run makes every run slower than serial. **On a wave of
more than about three lanes, the full suite belongs to the coordinator alone.**
A lane runs the individual gates it owns; `pre-commit` (build + both typechecks
+ four cheap gates, ~0.7 s) is what keeps each commit honest in between.

The corollary is the one that actually costs money: **no perf or memory number
taken during a wave is a baseline.** The same build read 1 211 and 1 280 MB five
minutes apart — a 69 MB spread larger than most of what a lane can cut — and
every arm printed `CONTENDED throughout`. Certify behind
`daemon.mts --wait exclusive-free`, or do not certify.

## `Math.abs` is an exemption wearing the clothes of an absolute value

`regaliadrive`'s steering assertion was `Math.abs(h1 - h0) > 0.3`. It is
**symmetric under negation of `steer` by construction**: no car it can tell from
its own mirror image. The steering shipped mirrored -- D turned left -- past 19
gates, 142 shots and both perf gates, and a human found it in about a minute.

The fix that holds (`b0da426`, 2026-08-31): drive `KeyA` **and** `KeyD`, require
**opposite signs**, and measure the **path** -- travel direction from world
positions, accumulated group by group so it cannot wrap -- rather than
`body.heading`, *because `body.heading` is the quantity the bug lived in*. The
chassis heading is then separately checked to agree with the path.

**And falsify the gate against the bug.** `src/tools/_probe/steerfalsify.mts`
wraps `_playerControls` to negate `c.steer`, reproducing the shipped bug exactly,
and runs the gate's own predicate: `as shipped -> PASSES`, `steer negated ->
FAILS`. A gate nobody has watched fail is a gate nobody has tested.

Two false failures were designed out and are worth knowing before you touch it:
four seconds of full lock at 159 km/h is more than a full circle, so `atan2`
wraps +245 deg into -115; and running on from the top-speed test leaves the car
in a ditch rotating 75 deg while its path moves 0.1 m -- hence the explicit
`it is moving while it steers` precondition.

## An exemption whose stated reason is not true of the code

`uxcheck` section 8 exempted every Regalia key pair under the comment *"driving
and on-foot combat are mutually exclusive states"*. **Nothing in the code makes
them exclusive.** `CombatSystem.update` gates `_readInput` on `input.enabled`
and `scenarioLock` only; nothing sets either on entering the car, and
`isDriving` has three readers, all of them UI. Measured with
`src/tools/_probe/inputcollide.mts`, which counts combat **calls** rather than
outcomes -- an outcome is conditional, so `setLockOn(autoTarget())` with no enemy
in range reads as "no collision" -- pressing V, T, B, Space and F while driving
called `setLockOn`, `drawEnergy`, `castSlot`, `dodge` and `heavy`, one each.
`Space` was not even in the exemption's pattern.

Replaced with `SHARED_ON_PURPOSE`, a per-key allowlist carrying a reason each,
and replayed against the parent commit to prove the new gate flags what the old
one excused. **An exemption states a claim about the code; check that the claim
is still true, because the exemption is exactly where nobody looks.**

## A tool's own documented usage line crashed it, and the flag in it was never read

`reliefstat.mts`'s header said, on line 7:

    reliefstat.mts a.png --against FFXV-field-ground

Running exactly that opens a file named `FFXV-field-ground` and dies. The arg
filter skipped the value after `--roi` and after nothing else, so any other
flag's *value* was collected as an input path. **And `--against` is never read
anywhere** — the reference median is computed unconditionally from
`GROUND_PLATES`. The flag was accepted, ignored, and fatal at the same time.

Two consequences worth more than the parser fix (`1f799ae`):

- **`--against` has almost certainly never been run by anyone**, because it
  would have crashed for them too. Any claim in a handoff or journal citing a
  `reliefstat --against` comparison did not come from this tool.
- It cost **44 minutes of daemon queue** on a busy night — two runs, 22 minutes
  each, both dying five characters into argument parsing. On a jammed box the
  cost of a trivial bug is not the bug, it is the queue in front of it.

The general rule: **a usage line is documentation, and documentation is not
executed.** If a tool's header shows an invocation, run that exact string once
before trusting anything downstream of it. The same night, a lane's own handoff
was found telling the next agent to run the crashing command.

## A `--dirty` A/B on a shared trunk measures every lane, not yours

Recorded 2026-08-31 after it produced a confident, wrong, "big win": a lane read
a large frame improvement from a `--dirty` before/after and it was **another
lane's in-flight edit** reaching it through the shared working tree.

Compounded by a second mechanism in the same measurement: `src/public/baked/` is
a **shared cache symlinked into every materialised build tree**, and
`vite-plugin-bake` re-checks its hash only at server start. So a clean
parent/child pair came back byte-identical, and a recipe edit made after a
long-lived dirty server started is served **stale**. This is also why
`driftcheck --build <old sha>` and `--build HEAD` returned numbers matching in
every digit on a night when the terrain had demonstrably changed: `--build` was
honoured — it announces the correct tree sha — but the *content* both trees read
came from one cache.

**On a wave, an A/B against an old sha is not a bisect.** Rebake, or measure
something the cache does not feed.

## A spec in world metres, graded by an instrument in pixels, is two different claims

The plan asked for "mid-frequency geology in the verified ~0.65 -> 300 m gap"
and named `reliefstat` as the grader. **`reliefstat`'s bands `d1..d64` are in
PIXELS.** Metres and pixels are related only through camera distance, so the two
halves of that task were never the same claim.

Worked, 2026-08-31: a 139 m swell seen from 300 m at 44 deg fov spans roughly
950 px — it lands **past `d64`, off the top of the pyramid**. Meanwhile the
d16/d32 shortfall the plan quotes is 16-32 px, which at 200-400 m is about
**2-8 m of world**. So the lane built for the band the plan named, correctly,
and the result was structurally invisible to the instrument the plan cited:
tier-B moved d16 by 0.00-0.04 and d32 by 0.17-0.47 against a shortfall of -6.80
and -7.82, with d1/d2 reproducing to 0.01 between runs. The d16/d32 deficit
belongs to a different band entirely.

**Before grading a spatial claim, convert the spec into the instrument's own
units and check the target band is on the scale at all.** A null from an
instrument that cannot see the change is not a measured negative — it is silence,
and the difference matters because a measured negative closes an item in this
project and silence must not.

(The tier-B block shipped anyway, with `?post=nomacroh`/`macrohmax` so the next
agent can price it against a better-matched instrument: it is not a regression on
any band, and its frames were read by eye.)

## `skinWeight` quantisation broke a merge three separate times in one night

Three lanes, three independent attempts at the same ~15 MB saving, three
different victims. Recorded together because the *pattern* is the lesson, not
any one of them:

1. **`AttrPack`, post-hoc, boot pass.** `MIN_VERTS` guards vertex count, which is
   the wrong axis for a character: an NPC's hair is 17-25 k verts and its hands,
   eyes and teeth are under 8 000. So the hair packed to `Uint8`, the rest did
   not, `mergeGeometries` saw `Uint8` beside `Float32`, returned **null**, and
   **deleted that person's shadow**. Built during play, long after the boot pass,
   so thirteen posed-shot imgdiffs could not see it.
2. **`mergeCreature`.** **23 of 23 species lost 6% of their vertices to the mesh
   origin**; `creaturecheck` read a deadeye's foot at **-3.768 m**. Reverted in
   `ce162a3`.
3. **`mergeParts`.** Its array-type table was hard-coded to `Float32Array`, so
   deriving type *and* `normalized` from the first part was load-bearing —
   without it every merged character would have shrunk to the origin.

**The rule.** Characters and creatures are the one family that is **re-merged
after the geometry is built**, and `THREE.mergeGeometries` requires every input
to agree on array type *and* `normalized`. So an attribute on anything that gets
merged can only be quantised **in the generator**, where every mesh gets one
format and no merge can ever see two — `rig/Geo.ts`, `rig/Sculpt.ts`,
`enemies/RigBuilder.ts`. Never as a post-hoc pass, however careful its guard.

**And note what caught each one:** a numeric gate, every time. A deleted shadow
appears only once an NPC streams in; 6% of vertices at the origin is a pose
statistic; neither is visible in a posed frame diff. Two of the three were found
by reading a gate's **full output** rather than its verdict line.

## `shoot.mts --post` never reaches the page, so an A/B taken that way compared a build with itself

Found 2026-08-31. The manifest comes back `"variant": ""` and the frame is
**unablated**. `--extra post=...` works; `--post` does not. Anything measured
through `shoot.mts --post` — any before/after, any "ablating this pass changed
nothing" conclusion — **is a comparison of a build against itself** and must be
re-taken. This is the third ablation-shaped instrument failure recorded here,
after `?post=nocloudsun` being overwritten a call later and `--hide` matching
nothing; the family is now large enough to be a habit:

> **Prove your ablation moved the frame before you trust that it did not.**
> An ablation that silently does nothing is indistinguishable from a measured
> negative, and this project keeps mistaking one for the other.

## `post.render` is mostly not post

The plan costed idle CPU as *"`post.render` is 74-77% of the frame"* and sent a
lane at `postfx/`. Measured per pass with `perfpasses` on a 6.7 ms calm frame at
q=high:

    ScenePass      4.40 ms
    VelocityPass   0.70
    Bloom          0.10
    GTAO / ContactShadow / TAA / DoF / MotionBlur / GodRays / Grade / CAS   0.00

**`ScenePass` is `renderer.render(scene, camera)`** — the scene draw itself. It
is inside `post.render` only because it is the composer's first pass. The whole
chain *after* the scene draw is ~0.3 ms. An independent ablation agrees:
`--post plain` with eight effects off reads 102.4% of a core against a 119.6%
baseline, i.e. 14%.

So a budget named after a call site can point an entire lane at the wrong
subsystem. **Attribute to what the call does, not to what it is called.**

## A GLSL compile failure blanked every frame for 40 minutes, exactly as this file predicts

Live instance, 2026-08-31: a grade-pass edit used `uNear`/`uFar` without
declaring them. The program failed to link, `pre-commit` cannot see a shader, and
**every capture taken by every lane in that window is blank** — 6 KB PNGs against
a normal 2.3 MB. Two lanes then landed the same fix concurrently and the second
carried both, producing `'uNear' : redefinition`, because an explicit pathspec
commits the *file* and not your hunks.

If a capture comes back tiny, look at the byte size before you look at the
content. The file-size check is the cheapest shader-link canary available.

## Every `--build <sha>` re-bakes the SHARED artifacts from that sha's sources

The worst measurement trap found in this project so far, because it silently
rewrites *other agents'* ground truth. Found 2026-08-31 by the new `bakecheck`
gate on its first run.

`src/public/baked/` is a single directory symlinked into every materialised
build tree. A `--build <sha>` run whose sources differ **re-bakes those shared
artifacts from that sha** — so on a wave, **every lane is capturing against
whichever sha was materialised last**, not against the tree it asked for.
Caught red-handed: `terrain.bin.gz` stamped from `c898bb4e`'s sources and
`tex.bin.gz` from `3187d788`'s, while `HEAD` was `4a6c840`. Three different shas
in one capture.

This explains a whole evening of confusion downstream — `driftcheck --build
<old sha>` and `--build HEAD` returning **bit-identical numbers in every digit**,
and a lane reading a "big win" from an A/B that was really another lane's
in-flight edit. It is why the same sha returned PASS and then FAIL.

**Consequences to hold on to:**
- **`--build <sha>` is not a bisect on a shared trunk.** It pins the *code* and
  not the *content*.
- A cached gate verdict must never be stored for anything reading
  `src/public/baked/` — it is git-ignored, shared between worktrees, and
  rewritten by any co-agent's `vite build`. A cached PASS would survive exactly
  the event such a gate exists to catch.
- `pnpm run build` **deletes** the painted-face cache without replacing it, and
  every lane's `pre-commit` runs `vite build`. `pnpm run build:full` is what
  makes them. `daemon --health` reports `paintedFaces` and `bakedGeometry`, and
  both read `false` for most of the night without any gate caring.

## An unbounded prewarm queue ate 62% of all harness time

`daemon.mts`'s `prewarm()` docstring claimed *"newest sha wins — a second commit
supersedes the first rather than queueing two boots"*. **The code never did
that.** `prewarming` was set at submit and cleared in the job's `finally`, so it
only rejected a duplicate request for the *same* sha; a request for a **new** sha
queued a second boot behind the first, and nothing ever dropped a prewarm for a
sha that had stopped mattering.

Eight lanes plus a `post-commit` prewarm hook per commit is a queue that grows
faster than four workers drain it. Measured twice, forty minutes apart:

    01:0x  sweep depth 55, 54 of them prewarm · queued 86663 s vs ran 16072 s (84% queue) · RSS 10.2 GB
    01:4x  sweep depth 63, 62 of them prewarm · queued 107085 s vs ran 16728 s
    harnessstats: prewarm 75 jobs, waited 1062.7 m, ran 58.8 m — p50 queue 8.4 min, worst 33.1

It presented as unrelated failures all over the wave: `preparePage` 300 s
timeouts, an ablation timing out twice, and three lanes reporting a `check` that
never returned. **A docstring describing behaviour the code does not have is
worse than no docstring**, because it stops anyone reading the code beneath it.

## A scanner that cannot tell a fix's rationale from the defect keeps every fix it inspires permanently red

`nansweep` flagged `normalize(cross(dy, dx))` in `SsrPass.ts` as a HIGH-risk NaN
site. The fix landed — and the sweep **re-reported the same words one line below
the fix**, because they appear in the block comment *explaining* the defect that
the code beneath it closes.

The second-order cost is the one worth recording: a tool with this property
**trains people to write the fix without the reason**, because leaving the
explanation in keeps the file red forever. That is a scanner actively degrading
the codebase it is meant to protect. `nansweep` strips comments now.

Generalise it: **any pattern-matching gate over source must exclude comments and
strings before it reports**, or its own success creates its next false positive.

## A guard's failure mode should be the pass's existing no-op, not a wrong answer

From the same fix, and it is the reusable half. Guarding
`normalize(cross(dy, dx))` on depth-derived deltas cannot use an absolute floor
on `|cross|`: **the deltas scale with distance** — one texel is a millimetre of
world at arm's length and metres of it at the far plane — so any absolute
threshold either misses the degenerate case up close or deletes the pass in the
distance. The scale-free quantity is `dot(n,n) / (|dx|^2 |dy|^2)`, which is
exactly `sin^2` of the angle between the deltas.

And the guard bails by writing `src` unchanged — which is what the pass already
does for every non-qualifying pixel. So its failure mode is **"no reflection
here"**, never **"wrong reflection here"**. When you add a guard, check what it
does when it is wrong, and prefer the branch the code already takes.

## A flag accepted and never read is this repo's most repeated defect

Counted 2026-08-31, in one night, in three separate tools:

- `reliefstat --against` — accepted, never read, and **fatal**: its value was
  collected as an input path, so the tool's own documented usage line crashed it.
- `bakecheck --json` — accepted, never read. Written by the same agent that had
  removed the `reliefstat` one **an hour earlier**, which is the part worth
  recording: knowing the defect is not protection against writing it.
- `shoot.mts --post` — parsed, never reaches the page. The manifest returns
  `variant: ""` and the frame is unablated, so every A/B taken through it
  compared a build with itself.

**An unread flag is worse than a missing one.** A missing flag errors; an unread
flag silently returns a confident answer to a question nobody asked. Two of the
three above invalidated measurements that were then written down as fact.

The cheap defence, and it is now the standing rule: **run a tool's own usage line
before trusting anything downstream of it**, and when you add a flag, make its
first commit the one that proves it changes the output.

## Test a gate's edge cases, not its happy path — it is a gate

Same night, same lane: `bakecheck --build <typo>` died in an unhandled rejection
and **exited 0**. No answer, and a green exit code, for a run that never ran.
A gate that exits 0 when it fails to execute is worse than no gate, because
`check` and every hook read the exit code. It names the bad ref and exits 2 now.

Pair this with the standing rule that a gate nobody has watched fail is a gate
nobody has tested: **make it fail on purpose, and make it fail to *run* on
purpose.** Those are two different tests and only the first is usually done.

## The Disc's crater rim was 70-90 m underground for the whole life of the project

`landmark_meteor`'s blind-critic verdict — *"does not read as a meteorite"* — was
chased through shading, emissive strength, bloom and two measured negatives.
The cause, found 2026-08-31, is geometry: **the rim ring and apron were buried.**
Measured median **−70 m against `Terrain.heightAt`**.

The mechanism is a units mismatch of the kind this file keeps recording:
`ground()` returns a **relative** height, the meteor group's origin is
**deliberately sunk 90 m**, and every apron shard and rim block was placed at
`ground() + a small lift`. Each of those three decisions is individually
reasonable. Composed, they put the entire crater under the terrain.

**Nothing downstream could have caught it.** There is no gate for "the thing you
authored is above the ground", the frames showed a rock and a rock is what a
buried-rim meteor looks like, and both engineering levers people reached for
instead produced honest measured negatives — because the levers worked and the
subject was not there.

Two lessons, and the second is the transferable one:

- **A "does not read as X" art verdict can have a geometry cause.** Before
  re-lighting or re-shading a landmark that reads wrong, verify its parts are
  where you think they are, in world space, against the terrain.
- **When a relative height, a sunk origin and a small lift are composed, check
  the sum against something absolute.** Related: 19 of the 22 emissive slabs
  were also sealed *inside* the rock, visible = 0 from all five stands
  (`probes/discglow.mts`, on demand). Two independent burials in one landmark.

## A judged shot can clear almost none of its own subject

Same landmark, separately measured: from the `landmark_meteor` stand,
`probes/discview.mts` (24 bearings x 5 ranges, marching `Terrain.heightAt` and
converting the highest occluding sample to an elevation angle) reports the frame
clears **0.09** of the Disc — a foreground ridge eats everything below the
crown, at every time of day. No crater, no rim, no apron, and **no art inside the
group can fix it.**

Exactly **one** stand in the world sees the crater rim: the Disc overlook off the
Cauthess highway, ~40 m above the parking, at frac 0.82.

So: **before grading a subject, measure what fraction of it the camera can
actually see.** A corpus shot that cannot see its subject will produce a stable,
reproducible, entirely honest verdict about nothing — and this one had been
doing so for the life of the judged set.

## A queued job measures the sha it had when it was QUEUED, not when it ran

Observed 2026-08-31 on a busy wave: a `drawcheck` sat 1803 s in the sweep queue,
ran for 49 s, and announced `sha:36a2ba52d2b4` — **where HEAD stood when it was
submitted, eight commits earlier.** Its report reads as current. Nothing in the
output says "this number is half an hour old".

On a fast-moving shared trunk that is a silent staleness of exactly the queue
depth. The 30-minute queue times this project hit on a ten-lane wave therefore
translate directly into 30-minute-old verdicts presented as fresh ones — and the
`[harness] sha:` line is the *only* place the truth appears, which is why it must
never be grepped away.

**Read the announce line on every queued result, and compare it to `git rev-parse
HEAD` before you believe a verdict.** Same discipline as `--build` pinning code
but not content: the harness is honest about what it measured, in one line, and
the line is easy to lose.

The same run also VOIDed with *"daemon socket idle for 2700 s — this is the
harness, not the game"* after capturing 16 of 47 shots. **A VOID is not a
failure and not a pass** — it is no evidence, and it must be re-run rather than
reported either way.

## A fixed `regionstat` rect is not an A/B instrument across `facecheck` runs

`facecheck` stabilises the **face**, not the **heading**. So a rect that reliably
frames a hero's hair also frames whatever is behind him, and that moves between
runs. Measured 2026-08-31: **Noctis's hair rect read black hair in one run and
blown-out sky (p50 185) in the next, with no code change between them.**

Any percentile taken through a fixed rect across two `facecheck` invocations is
comparing two different populations. Use the same *run* for both arms, or mask
to the subject, or measure something the background cannot enter.

## Matching one percentile is not matching the distribution

Fitting a hair-fill coefficient to the plate's median produced a frame whose
median was right and whose **spread was wider** — a flat additive fill
*widens* a distribution instead of translating it, so the tails miss in opposite
directions. `ART-DIRECTION` §12.3 gives **five** percentiles per plate for
exactly this reason, and the statistically best single-number fit was rejected on
sight because at that value Noctis's black hair reads **grey**.

    fill 0.30   prompto  15 / 89 / 209     noctis  1 / 46 / 149   <- best median fit, reads GREY
    fill 0.18   prompto   9 / 76 / 206     noctis  0 / 26 / 135   <- landed
    plate       prompto  22 / 81 / 176     noctis 20 / 37 / 140

**Check the tails before accepting a fit, and look at the frame before accepting
the tails.** This is the same lesson as the heavy-tailed-field entry above, in
the opposite direction: there, one extreme value was noise; here, the extremes
are the whole judgement.

## A done-when can name a flag that does not exist, and the run will pass anyway

Plan task 64's exit was *"`longplay --night`"*. **`longplay` has no night mode.**
It reads only `window.__PLAY_MINUTES`; `probe.mts` parses its own flags
(`--shot`, `--ttl`, `--turbo`, `--set`, `--cpu`) and forwards nothing else. So
`--night` was accepted by the shell, ignored by everything downstream, and the
run returned a confident **PASS — 30 minutes of continuous play, nothing
wedged**.

That PASS is true and it is about the wrong thing: it was a **daytime** session,
and `RegaliaSystem._nightRoadDanger` — the entire feature the exit exists to
verify — was never reached. Nothing in 30 minutes of output mentions night,
because nothing about the run was night.

This is the same family as the unread-flag entry above, but worse in one way:
there the tool crashed or returned nothing, which is at least visible. **Here an
unrelated green was produced and could have been reported as the exit.** The
plan's own `nanscan` command line has the identical defect (`probes/nanscan.mts`
is a probe body and needs `probe.mts`), so this is a habit of the briefs and not
one accident.

**Before quoting an exit, run its command and confirm the output mentions the
thing being tested.** A PASS that never names your subject has not tested it.

**And the second half, found while closing that hole: the clock does not run.**
`Sky.hours` (`src/world/Sky.ts:454`) is initialised to 12 and only ever changes
inside `Sky.setTimeOfDay`. `DayCycle.syncFromSky` is true and `driveSky` is
false (`src/game/rpg/DayCycle.ts:167-168`), so `rpg.day` *follows* the sky and
neither of them advances on its own. **A thirty-minute probe session is thirty
minutes of one single hour** — whatever the last `applyShot` left in the sky,
which for `longplay`'s `hud_field` is **14:00** (`Shots.ts:317`, `time: 14.0`),
not the noon the sky boots at — and `DayCycle` reads 09:00 from its own
constructor until its first `update` catches it up, so asking the clock before
the first frame lies about it too. So it is not merely that `--night` was ignored:
there was no way for any long-running probe to reach night at all, and nothing
in any of their output ever said which hour it played.

This makes every "the world keeps producing X" rate in `longplay` a *daytime*
rate, and it silently excludes every night-gated table in `SpawnTables.ts` —
`goblin_swarm`, `daemon_pack`, `ronin_duel`, `night_giant` — from the only gate
that runs long enough to meet them. `longplay` now takes `--set __PLAY_NIGHT=1`
and names the hour, the `nightDepth` and the `nightDanger()` it played at in its
banner, its summary and its PASS line, on day runs as well as night ones.

**If a system reads a clock, ask what is turning it before you believe a long
run exercised it.** Two systems politely deferring to each other over who owns
a number is a clock that never moves and never errors.

## `PartBuilder.prep()` silently deletes any attribute not on `KEEP`

Found 2026-08-31 by lane 20, after its emissive veins rendered dimmer than
authored no matter what radiance it used. `prep()` drops every attribute absent
from `PartBuilder.KEEP` at `B.add`, **with no warning**. `aEmissive` was not on
the list.

The failure mode is the expensive one: it does not error, it does not render
black, it renders *the geometry without your channel* — which reads exactly like
"the effect is too weak". Lane 20's own words: it would have read back as *"the
veins are too dim" for as many rounds as anyone was willing to raise the
radiance.* Four vein mechanisms went through that lane; the first one was fighting
a deleted attribute.

**When a new vertex attribute has no effect, check that it still exists on the
geometry the frame draws** — `KEEP` lists, merge specs (`mergeGeometries` needs
every input to agree on type *and* `normalized`), and bake round-trips are all
places an attribute quietly stops existing between where you write it and where
the shader reads it. Three separate instances of this shape are recorded in this
file tonight.

## A pool `reset()` that restores some scaled fields and not others compounds forever

`EnemyBase.reset()` restored `maxHp` from `baseMaxHp` and `damage` from
`type.stats.damage`, then wrote `this.poise = this.maxPoise` **without ever
restoring `maxPoise`** — which is assigned in exactly one place,
`Bestiary.make()`, on the fresh path only. `Enemies.spawn`'s level scale is
**multiplicative**, so a den-lifted animal carried its scaled poise back into the
pool and was scaled again on every reuse.

**It is a live gameplay bug, not a test artifact:** territories respawn on a
90-360 s timer, so animals got closer to unstaggerable the longer a player
stayed in one area — a difficulty drift nobody would report as a bug because it
feels like the game getting harder.

**The arithmetic is what identified it, and it is the transferable part.**
Species poise is 42; one level-24 scale gives 70, level-25 gives 74. The gate
reported **71**, which is not any single scale of 42 — only two rounded scales
stacked. *When a measured value is not reachable by one application of the
transform you suspect, look for two.*

Two further lessons from the same diagnosis:
- **The coordinator's hypothesis was wrong and was checked rather than taken.**
  It blamed level scaling reaching the fixture; `spawnAhead` is
  `enemies.spawn(key, {pos, heading})`, and `Enemies.spawn` applies `levelScale`
  only when the requested level *differs* from the species level. Task 34 did not
  cause the failure — it put a level on enough spawns to make an existing leak
  fire.
- **The fix went to the leak, not to the expectation and not to the constant.**
  Both the gate and the scaling were right; only the reset was wrong. Widening
  the gate would have hidden a shipping bug.

## `Face.brushes()` already returns `expandMirrors(b)`, and expanding it twice is silent

`Face.ts:540` ends `return expandMirrors(b)`. `expandMirrors` is **not**
idempotent: given an already-expanded list it re-mirrors every `mirror: true`
entry, so each side lands in the list twice and `applyBrushes` — which SUMS
every brush against the original position — applies it at **double amplitude**.
99 brushes become 179 and the face silently doubles the depth of every socket,
crease and cheek.

Measured 2026-08-31: an off-harness decomposition of the mid-face crease read
17.99 mm of surface Laplacian where the real figure is 9.00, and named the
mirrored twin of a brush as a contributor at a point it cannot physically reach
— which is the tell. Anything that consumes `brushes()` hands it to
`applyBrushes` **as it is**.

## The surface Laplacian decomposes a sculpt exactly, so a groove can be attributed without a build

`applyBrushes` sums each brush's displacement against the *original* position
(deliberately — sequential application makes mirrored pairs asymmetric). That
makes the sculpted surface a **linear** function of the brush list, so any
linear functional of it is too. Take the Laplacian over a 3 mm stencil — a
groove is a positive Laplacian and its magnitude is how hard the fold turns —
and `L = sum over brushes of L_b`, exactly. No ablation build, no capture, no
queue: one Node script names which brush owns a crease and by how many
millimetres.

That is how the mid-face diagonal was pinned to the alar crease (5.28 of a 9.00
peak) and the alar ball (2.91) in one turn, after three respawns had looked for
it in `paintFace`, in the fringe's cast shadow and in the merged shadow proxy.
**Ablate the shading stack to prove a defect is geometry; decompose the brush
field to find out which geometry.**

## An A/B whose sample length is commensurate with a refresh period measures the phase, not the change

`chocobodraws` reported the mount **saving** ~143 draw calls, twice, and its
control arms read 589 and 489 four frames apart. That was recorded as "the
instrument does not settle its own control" and no draw number was quoted for
the mount. The real cause, found 2026-08-31: **shadow cascades refresh every 2
frames and a read was 31 frames long**, so an A/B pair spanned 62 — an exact
multiple — and every arm was **phase-locked** to the same point in the cascade
cycle. The variance was not noise; it was aliasing.

Fixed by making a read the mean of **120** frames. **Null spread fell from 213 to
1.6 draw calls**, and the honest answer emerged: mount plus a three-bird flock
costs **10.7 calls, 2.7 per bird**, against a bar of 5.4 and a budget of 800.

**Check your sample length against every periodic thing in the frame** — cascade
refresh, TAA jitter cycle, a streamer's tick, an animation loop. A quantity that
looks wildly noisy at one sample length and quiet at another was never noisy.
And note which way this cut: the aliased instrument's error was **large and
signed**, so it did not look like noise, it looked like a discovery.

## A prompt that moves while it is being offered, and nine that passed by luck

`Tombs.install` handed `Interaction` a **live** `Vector3` on the POI pin;
`Tombs.update` then re-pointed that same vector onto the kit's `sarcophagus`
anchor the first time `PoiKits` built the temple. `_pick` reads `pos` live. So
the target moved **mid-walk-up**, 7.19 m, at every one of the ten tombs — only
the bearing turning with the kit's random yaw.

`integration` samples `it.pos`, walks 2.2 m out, and asserts 8 frames later. For
one tomb the re-bind landed inside that window:

    pos0=(-2514.0,51.9,-3292.0) r0=15 -> pos1=(-2514.7,58.9,-3284.8) r1=6.5 moved=7.19
    walk=(-2512.4,52.7,-3290.4) dEnd=6.05 cone=200 -> nothing

**`dEnd=6.05` is inside the 6.5 m reach — it failed on *facing*.** The coffin came
to rest **107 deg** off the approach and `cone: 200` admits +-100. **The other nine
passed by the luck of a 0.3 s throttle, not by any property of themselves.**

A second, yaw-independent defect fell out of the same numbers: the prompt was
advertised at the pin with `REACH_FAR = 15` and re-anchored with
`REACH_NEAR = 6.5`, and **6.5 < 7.19** — so on binding it no longer reached the
place it had just been offered from.

**The invariant `_pick` was written against, now enforced:** once a prompt
exists, its position never moves. The fix gates the prompt on `anchored`, so it
simply does not exist until it is where it belongs. New `probes/tombreach.mts`
asserts it directly — *no enabled item's `pos` moves during its own walk-up* —
across 96 interactables.

**Generalise:** a gate that samples a position, acts, and asserts later cannot
see a target that moves between the sample and the assertion. When such a gate
fails on one of N identical things, suspect a race, not that one thing — and be
suspicious of the N-1 that passed.

**It happened again, in `ChocoboHub`, and the probe written for it missed.**
Same shape: prompts registered off world-axis offsets 23.7 m and 35.4 m from
the POI pin, `_reanchor` re-pointing the same live vectors onto the kit's
post-yaw `stable`/`board` anchors at ~10 m. Measured `moved=32.39`,
`dEnd=34.34`, `radius=3.2` -> `1/76 unreachable: chocobo-stable-wiz->nothing`,
red under `HARNESS_TURBO=10` and green standalone because turbo changes the
phase. Two lessons past the first:

- **`tombreach` reported `0 moved while offered` on that exact run.** Its
  claim-3 test compared each item's `pos` across *its own* eight-frame walk-up,
  and `_reanchor`'s 30-frame throttle put the move in another item's window. A
  probe written for a class inherits the luck of the class unless it is
  phase-independent: it now records where each item was **the first frame it
  was seen enabled** and compares at the end of the whole run.
- **Check the give-up before you gate on the bind.** `_reanchor` stopped polling
  after `_tick > 30 * 40`, counted from *boot* rather than arrival, so twenty
  seconds in the poll was dead for the session. Gating `enabled` on a bind that
  a timer can cancel turns a mis-placed prompt into an absent one. And not
  every hub in a table gets the kit: the Alpine Stable sits on a `parking` POI
  that publishes no anchors at all, so it has to be settled at registration.


## A `Float16BufferAttribute` is a `Uint16Array`, and the bake threw away the only bit that said otherwise

Found 2026-08-31, and it is the largest visual defect this project has shipped.
Eleven shots rendered as **pure white rectangles** and thirty more carried a
white veil; two of the eleven were judged PAIRING rows blind-compared against
shipped FFXV plates, and the critic flagged them unprompted.

`AttrPack` re-packs an over-bright vertex `color` as
`THREE.Float16BufferAttribute`. `GeoBake` recorded `arr.constructor.name` and
`normalized` and rebuilt everything as a plain `BufferAttribute` — and those two
fields **cannot tell the two apart**: a half attribute and a plain `Uint16` one
are the same typed array with the same `normalized` flag, differing only in the
`gpuType` three uploads. So the restored attribute went up as `UNSIGNED_SHORT`,
unnormalised, and the shader read the raw half-float *bits*: 1.0 arrives as
15 360. A whole city radiated four thousand times over and bloom smeared it
across every pixel.

Three general shapes, all of which this file already predicts and none of which
caught it:

1. **A serialiser that records a typed array's constructor is recording less
   than the attribute's type.** Anything the GPU is *told* about a buffer that
   is not implied by its bytes has to be written down. Check `normalized`,
   `gpuType`, and the attribute subclass, every time.
2. **The instrument lied in the way this file's "measurement trap" section
   says instruments lie.** `geometry.attributes.color.array` on a half
   attribute holds **bits, not values**, so a first read of "max 15879" was
   equally true of the nine *healthy* meshes. The number does not separate
   them. `isFloat16BufferAttribute` does.
3. **A sub-rectangle of a buffer is not the buffer.** A per-pass probe that
   read `readRenderTargetPixels(rt, 0, 0, 400, 225, …)` on a 1600x900 target
   reported bloom's input as max 0.47 when it was 11 944, and pointed the
   diagnosis at the composite for two turns. It reads the **bottom-left
   corner**, and the bottom-left corner of that shot is pavement.

**A `--build <sha>` before `e848801` re-bakes a version-1 `geo.bin.gz` over the
repaired one and every lane's frames go white again**, per the "Every
`--build <sha>` re-bakes the SHARED artifacts" section above. `GEO_BAKE_VERSION`
is 2 so a stale cache is a clean miss rather than a silent wrong answer, but the
re-bake still has to be re-run: `node src/tools/texbake.mts --geo`.

The gate that would have caught it in a second, and did not exist:
`src/tools/framecheck.mts`.

## A white frame passes every gate in this repo — it did, three times

`nanscan` 0 of 166. `drawcheck` PASS, on 7 853 662 drawn triangles.
`perf` certifying 166/166 shots. `check` 20/20. All of that on a corpus with
eleven pure-white frames in it. A blown frame is not a page error, does not move
a draw count, and **against a baseline that is blown the same way it is not even
a pixel diff** — the identical argument this file already makes for a NaN hole.

The same hole has now cost this project three separate windows: the `GradePass`
that would not compile and made every frame black; the `uNear`/`uFar` link
failure that blanked every capture for forty minutes; and this. Each time the
diagnosis started from a byte size somebody happened to notice.

`framecheck` closes it: one boot, every shot, the **default framebuffer** for
what a reader would see and `rtScene` for the radiance that produced it, so it
says not only that a frame is broken but whether the scene or the post chain
broke it. `sceneMean` read **1 185** on `lest_market_day` against **0.353** on
the healthy `galdin_beach`, and that one ratio named the bake before anything
was edited.

## Matching a luminance table is not matching the colour

`ART-DIRECTION` §12.3 is a table of **luminance** percentiles per plate. Four
passes at the head measured against it, matched it well, and a first-time player
still reported *"four grey-haired, blank-faced people"* at ordinary walking
distance. **Chroma was never measured, by anyone, at any point.**

Measured 2026-08-31: Ignis's and Prompto's authored hair albedos are literally
**warm greys** — 21% and 25% saturation. R-B percentiles p10/p50/p90/p99:

    ignis    before  6/19/29/33   after  21/42/62/76   plate  23/98/126/129
    prompto  before  8/23/34/39   after  23/46/68/79   plate -22/-9/47/55

Luminance was already close; hue was not in the room. After the fix Ignis reads
golden ash-brown instead of silver and Prompto sandy blond instead of grey, with
Y held.

**Two rules:**
- **When a reference table names a channel, check what it does NOT name.** A
  table of Y percentiles will happily certify a desaturated frame.
- **Measure over a mask, not a rect** (`_probe/hairstat.mts`) — the rect trap is
  recorded above: `facecheck` stabilises the face, not the heading, so a fixed
  rect samples a different population run to run.

And the diagnostic that ruled out the obvious answers first, worth copying: a
**constant-head-size distance ladder** — fov narrowed so the head covers the same
pixels at 1, 3, 5 and 10 m. **1 m and 5 m came back the same image**, which kills
LOD swap, mip collapse, alpha-test dropout and a stale painted-face cache in one
capture, without four separate ablations.

## The same "hole" in Gladiolus's back has now fooled three observers

A skin-coloured gap in his shirt at party range has been reported by a blind
playtest and by two separate lanes, and diagnosed as a garment defect twice.
**It is his bare arm** — `sleeve u1: 0.40` with no shirt, both authored. Settled
by ablation at one fixed rear framing: hide the body and the garment is a
continuous shell shoulders to hips; hide the outfit and the tan mass runs
deltoid to wrist and ends in a hand.

The reason it keeps winning is measurable: **arm Y is about 150 against a torso
at Y 15, with no separating shadow.** So it is a real defect and it is a *read*,
not a hole — the fix is art (ink on the deltoid, or a contact-shadow term), not
geometry. Recorded because the next person to see it will also think it is a
hole.

## The hint card is muted in every capture this project has ever taken

A first-time player reported the tutorial card lying across **six of six**
full-screen menus — over column headers, over the selected item's name, over a
quest title, over a companion's entire header and portrait. Measured after the
fact: **83 px of hint card inside the reading band on 16 of 16 screens.**

Nobody had ever seen it because **`HUD.update` writes `hints.muted =
!!game.currentShot` every frame, and `Hints._poll` returns early on
`currentShot` too.** Every posed capture in this repository sets a shot. So the
one element that covers every menu is switched **off** in every screenshot, every
contact sheet and every judged round the project has ever produced.

**An element that hides itself during capture is invisible to a capture-based
process, permanently.** When a player reports something no frame has ever shown,
check whether the frame is *allowed* to show it before doubting the player.

## A projection bug whose error is exactly zero at the authoring resolution

Every projection in `CombatHUD` — nameplates, reticle, damage numbers, call-out —
was off by the HUD's `zoom` factor **at any viewport that is not 1600x900**. At
1600x900 the error is **exactly zero**.

Every capture, every gate and every corpus shot in this project is taken at the
authoring size. So the bug was unreachable by the entire instrument suite, and it
took **a human looking at their own window** to report "three HUD elements draw
at the same screen point". Two lanes had independently filed HUD-stacking
symptoms without finding this cause.

**A defect that vanishes at your reference resolution is invisible to every
reference-resolution instrument you own.** Vary the viewport deliberately, at
least once, in any gate that reads screen-space positions.

## A cliff you cannot climb is legitimate; a cliff you stand still on is a bug

The playtest's *"you run at a slope and just stop dead — ten seconds of sprint
moved me one metre, no slide, no stumble, no message"* was not a slope-limit
problem. Raising the limit is a **measured negative**: `slopewalk` shows four of
five sites between 47 and 58 degrees already climb.

The real defect: the downhill push was recomputed every frame, and `Player`
rebuilds `velocity` from heading and speed every frame too, so **the push could
never accumulate**. The character slid until the push exactly cancelled his own
effort and then **parked on that contour** — upright, `grounded` true,
`progress` about 0, so the animator held the idle. A perfect, silent equilibrium.

Fixed by giving the slide momentum (so equilibrium is unreachable) and by making
the HUD state the rule. **6 of 15 hillsides DEAD-SILENT -> 0 of 15.** And note
`longplay` had been printing *"gave up on N unreachable spot(s), turned away from
being stuck N time(s)"* all night; the number was in the output the whole time
and nobody read it as a defect.

## The cloud shadows were a tenth of the size of the clouds casting them

Not a tuning problem — a **projection error**, and it had been read as "the
shadows are too weak" for a long time. `SHADOW_FRAG` bakes over
`uShadowTile x uShadowFieldScale` metres while `MaterialPatch.ts:120` maps that
bake onto `uShadowTile` of ground, so **any scale other than 1.0 shrinks every
cloud shadow by exactly that factor.**

Measured with a purpose-built instrument (`probes/shadowscale.mts`, which
autocorrelates both fields and converts through their own world spans, and
validates itself every run against two synthetic gratings 3.5x apart —
recovering 3.48): **a 199 m ground patch under an 1844 m cloud, ratio 9.24.**

Fixed with two numbers. Worth two frames in twelve, honestly reported — and one
of the twelve is instructive: **`zone_longwythe` lost its fine dapple, and that
dapple *was* this bug**, not terrain detail anybody had authored.

**When a projected effect reads as "too small" or "too weak", check the two
world spans agree before you change a strength.**

## `runnel` ruled parallel planes across the entire world

The "diagonal weave" the blind judge saw across whole massifs — two crossing
families at 12-13 px and 7.6 px, at 55 degrees — was **albedo**, attributed by
ablation with every obvious suspect cleared: it survives `nogully`, `nomeso`,
`nomacroh` and **`nostoch`** (whose positive control fired blank, ruling out tile
repetition) and collapses under `gwhite`.

The cause: each `runnel` octave dotted `P.xz` with a **fixed world azimuth**
against a `P.y` term of ~0.005 — so each octave was a family of **parallel
vertical planes ruled across the entire world**, at 19 / 6.5 / 59 m on three
bearings. Every mountain in the game was wearing the same tartan.

**Fixed with a bounded domain warp, not a rotation** — a fall-line rotation has
derivative `|P|` and swings through thousands of cycles on a cone 10 km out,
which is a trap the bedding comment in the same file already records.

## A low periodicity score is not evidence of absence

`weavestat` read **0.12 before and 0.11 after** a fix that visibly works — at 3x
the tartan becomes fluting, and `imgdiff` against the ablation control reads
**2.706/255 with 9.8% of pixels past 8/255** against a 0.39 floor.

The instrument measures **local** periodicity; the defect was **global
coherence** — one azimuth held across kilometres. Those are different
quantities, and the tool now says so at the top of the file. **Do not read a
low score from a periodicity metric as "no repetition"** any more than you would
read a null from an instrument that cannot resolve the change (see the
world-metres-versus-pixels entry above).

## A leased probe page has not stepped a frame

Uniforms read their **constructor defaults** until `g.settle()`. A lane spent
half an hour concluding "the weather preset system is dead" from
`uShadowFieldScale` reading 30 — its constructor value — on a page that had
never rendered.

**If a live value looks exactly like a default, settle the page before you
believe it.** Related and recorded above: `applyShot` on a cold page returns a
white rectangle until ~200 settle steps.

## A disposed PMREM silently rebinds to a 1x1 black texture

The Regalia rendered as **a flat black silhouette from every angle in full
midday sun** — reported by a blind playtester as "the car in the middle of it
looks unfinished", and it had been that way indefinitely.

`RegaliaSystem.init` pinned `scene.environment`. **`Sky._updateEnv` disposes that
render target on every time-of-day change**, and three.js then **silently rebinds
`emptyTextures`** — a 1x1 black. The car's `chrome` material is `metalness 1.0`,
so the environment map is its **only** light source. Black in, black out, no
warning, no error.

**Never hold a reference to a render target another system owns and disposes.**
And when a `metalness 1.0` material renders black, suspect its environment
binding before its albedo — a fully metallic surface has no diffuse term to fall
back on, so an unbound env map is indistinguishable from black paint.

## `E` with no prompt fires a warp-strike, so pressing it walks you away

The playtest's *"stood in Hammerhead, pressed INTERACT ten times, nothing"* had a
second half nobody guessed: with no prompt in reach, `E` falls through to
warp-strike (`CombatSystem.ts:1529`). **Each of those ten presses teleported the
player further from the shop they were standing next to.**

The interactable itself was real — the garage counter was **7.0 m away against a
2.6 m reach**, and the diner's anchor was **inside a sealed building**.

Two rules: a null interact should be a null, not a different verb, inside a
settlement; and **a prompt that is out of reach and a prompt that does not exist
must not feel identical to the player.**

## A probe that teleports cannot tell you whether a human can stand there

`tombreach.mts`, `reachall.mts` and `reaudit.mts` all write
`player.root.position` **directly**, bypassing `CollisionWorld`. So all of them
happily verified an interactable that sits **inside a sealed building** — the
prompt is reachable from a position no player can occupy.

That is how `integration` stayed green over an unreachable shop while a
first-time player pressed E at it ten times. `integration` now carries a
`Collision.blocked` assertion; the three probes still owe it.

Measured alongside: **35 of 56 fast-travel arrivals have nothing in reach at
all**, and one (`meldacio_layby`) lands **inside geometry**. The pad-height
hypothesis for the Hammerhead case was tested and is a **measured negative** —
1 of 56, and not that one.

## A raycast against three properties that have never existed

`CameraRig._armDistance` swept terrain and nothing else. Where a prop sweep
should have been sat a **dead comment** describing a raycast against
`Props.cameraColliders || Props.colliders || Props.collisionMeshes` — **none of
which `Props` has ever had.** The chain short-circuited to undefined, the ray
never ran, and the code read as implemented to everyone who opened the file.

A `||` chain over three plausible property names is indistinguishable from
working code until you check that one of them exists. **When a system "already
handles" something and the symptom says otherwise, verify the handle resolves
before you tune what it feeds.**

## Characters walk through boulders, and that is what "fights inside a hill" meant

The playtest's worst complaint — *"my whole screen became a wall of blurred brown
mud"* — was investigated as a camera defect and the camera fix is real
(lens-inside-a-boulder **1.24% -> 0.62%** over 3552 paired poses). But the
camera was never the cause.

**`Harvest.collectRockProxies` returns `[]`.** Nothing stops a character entering
a rock. Measured on live dens: **Noctis's own chest is inside a boulder on 31.5%
of combat frames** — 64%, 58%, 93% and 100% in the four fights that happened in a
tor. The player was not looking at a hill *behind* the fight; the fight was
*inside* the rock, and so was he.

Two measured negatives from the same investigation, both worth keeping:
- **The terrain is innocent.** 0.00% of 2592 poses put the player behind the
  ground. The 0.7 m ground clearance is real and is not the cause.
- **A radial push-out made it worse**, photographed: it turned a legible frame
  into a wall of brown rock. The fix that works is a jump to the desired point on
  the arm line, clear by construction.

And a measurement caveat that generalises: **`fightcam`'s absolute percentages
are not quotable across runs**, because the camera arm feeds `Props.update`, which
drives streaming, which changes `drawnHeightAt`, which changes where feet land.
Quote the **paired** sweep instead. An instrument whose subject moves when the
instrument moves needs a paired design.

## "Receiving no light" is a read, not a mechanism

A blind judge said the black placeholder props were *"receiving no light and
casting no contact shadow"*, and that phrasing points at a lighting bug. It was
not one. A purpose-built probe swept the albedo and read the framebuffer back
through an ablation-derived mask:

    0x25262a (shipped) -> 50, 42, 40
    0x4a4c54           -> 56, 47, 52
    white              -> 131,129,137

**The light path was alive the whole time.** The albedo was simply **4-5x darker
than the ground it sat on**, so the object read as unlit. The "no contact shadow"
half *was* real and had its own cause: the object was in the **decal builder**
(skid-marks, `renderOrder = 1`, past `castCount`) rather than the caster
builder.

Three phrases of one sentence, three different mechanisms, only one of them the
obvious one. **Measure what a perceptual complaint actually is before adopting
its implied cause.**

## The corpus for judge round 18 was captured three minutes before its own fix

`tmp/r18/vista_noon.jpg` was written at 04:33; the commit that fixed the tiling
artefact in it landed at 04:36. So round 18's tell about *"an outright
checkerboard artefact across the peak face"* was judged on a frame that was
**already repaired in the tree**.

On a trunk moving this fast, **a judged round is a snapshot of a sha, not of the
project** — record the sha the corpus was captured at, alongside the verdict, and
re-shoot before re-judging anything that a lane has touched since. Two rounds
tonight were partly measuring builds that no longer existed.

## Do not grade a tiling artefact with a band-limited FFT

Band-limited to 10-40 px, the analysis returned **36.0 px at 37 degrees and
36.6 px at 114 degrees for every build and every ablation** — including ablations
that visibly removed the pattern. It was measuring **its own cutoff**, not the
image, and it nearly bought a false attribution.

Same family as `weavestat` reading 0.12 before and 0.11 after a fix that visibly
works: **an instrument with a band, a window or a mask has a null it will return
regardless of the subject.** Prove it responds to the effect — with a positive
control that fires — before you trust the null.

