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

- **A stale texel bake is the one cache failure with no symptom.** `src/public/baked/`
  holds **three** caches of our own generators — `terrain.bin.gz` (the heightfield),
  `tex.bin.gz` (143 procedural `DataTexture`s, from `src/engine/TexBake.ts`) and
  `texc.bin.gz` (the *drawn canvas* mip chains behind every painted face).
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
  all three caches out of the loop entirely for one page load — which is also how you
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
