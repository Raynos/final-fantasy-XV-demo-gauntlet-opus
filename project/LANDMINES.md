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
  whole hillside.
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

- **`Character.ts:73` sets `faceMat.side = THREE.DoubleSide`, and a back-facing
  surface renders in front of the eyeball and hides it completely.** So socket
  depth controls eye visibility **non-monotonically**: too shallow by a little
  and an inverted-winding *fold* covers the globe while the skull does not —
  identical in appearance to a shading bug that does not exist. A `FrontSide`
  test passes while the shipped material still fails, so **verify with
  `DoubleSide` specifically.** The real fix is to stop the sculpt folding: widen
  the socket brushes toward `[0.048, 0.032, 0.058]` and add `pow: 1.6`.
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

## Harness and measurement

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
