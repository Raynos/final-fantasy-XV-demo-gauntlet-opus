# Sibling-repo port plan — techniques worth stealing

Status: IN-PROGRESS (2026-08-23, opus) — **Wave 1 is done; Wave 2 is half done;
Waves 3 and 4 are untouched proposals.** Audited against the tree 2026-08-23,
item by item:

| item | state | evidence |
|---|---|---|
| 2.1 determinism pinning | **DONE** | `417ca86`, on `main`. 1.836 -> 0.340 mean/255 against a measured 0.302 floor. The cause was the wind, not the formation this plan predicted |
| 2.2 shader warm + `compileAsync` | **REJECTED, measured** | `4c1d813`. Warm exists; `compileAsync` is **3% slower here** (1562 ms sync vs 1611 ms median, six pairs). `runAsync` and `bootprof --warm-ab` kept so the next GPU can re-check in one command |
| 2.3 `seatHeightAt` / `drawnEnvelope` | **DONE** | `Terrain.ts:496`, `props/Seat.ts`, and a `seatcheck.mts` that rasterises the real clipmap to check it |
| 2.4 self-validating perf ruler | **DONE** | `RULER_VALID` in `perf.mts:309` and `gameplay.mts:371`. It earned its keep immediately — it voided a ruler that reported 63 fps for a game running at 190 |
| 2.5 ablation dials | **DONE** | `shoot.mts --hide/--ablate`, and the rule written into `BRIEF.md` §"ablate before re-tinting" and `HANDOFF.md:43` as this plan asked |
| 2.6 contact shadows | **PRESENT, AND MEASURED INSUFFICIENT** | `postfx/ContactShadowPass.ts` exists and grounds nothing at scenery range: it marches 0.5 m and range-gates at 55 m while graded shots' nearest ground is 61-80 m. See `project/handoff/grounding.md` — this is the judge's #1 open item |
| 3.1 art-direction corpus | **DONE** | `docs/reference/ART-DIRECTION.md`, `PLATE-SOURCES.md`, `plates/`, `sibling-{RENDER-INVENTORY,TRAPS}.md` |
| 3.2 grade stats + blind A/B | **DONE** | `compare.mts` (sealed key, `--control`) and `imagestats.mts`. Ten rounds run; score 3 -> 4.5/10 |
| 3.3 grade upgrades | **NOT DONE** | The finite-clip item is measurably still open: four of our six frames clip at exactly 0.00% where eight of ten reference plates clip >=0.10% |
| 3.4 depth-weighted additives | **NOT DONE** | No `airDepth` term anywhere in `src/engine/postfx/` |
| 3.5 horizon-angle bake | **DONE** | `world/terrain/Horizon.ts` + a `horizoncheck` gate at MCC >= 0.85 |
| 3.6 grass tier-D et al | **MEASURED, DELIBERATELY NOT BUILT** | See the annotation in §3.6 — the gap is confirmed by ablation, the fix waits on the grade it would have to match |
| 3.7 water depth model | **NOT DONE** | No Beer-Lambert, no refracted bed |
| 3.8 sky-SH + PCSS | **NOT DONE** | Neither exists |
| Wave 3 (perf) | **one item landed incidentally** | GenCache-style generator-hash invalidation shipped as `texbake.mts`'s `TEX_SOURCES`/`CANVAS_SOURCES` hashing, out of phase 3's boot work. Nothing else |
| Wave 4 (gameplay) | **NOT STARTED** | No `setMotion`, no perception meter, no swept camera — `CameraRig.ts:247` says in so many words "this is where it would be swept" |
| §6.2 per-shot noise floors | **NOT DONE** | `imgdiff.mts` still carries one global floor |

Author: Fable 5 audit pass, against commit `a1df21d`.
Sources: full audits of the sibling repos under
`/Users/raynos/projects/game-demos/gauntlet-demos/` — `final-fantasy-XV-demo-opus`
(three.js, the deep run), `metal-gear-solid-5-opus-demo` (three.js, shipped
60 fps stealth demo), and the four dead experiments (`-ogl-opus`,
`-bablyon-opus`, `-bablyon2-opus`, `-gpt-5-6`) — plus a full read of this
repo's own docs (BRIEF, SCOPE, HANDOFF, RESCUE, all handoffs and plans).

---

## 0. The one-paragraph version

The sibling repos are not prototypes to strip-mine for features — this repo
already has more game than any of them. What they have that we do not is
**measured answers to the exact problems on our open list**: RESCUE.md's
determinism hole, the 22 ms shadow-cascade cost, the shader-compile freezes,
the perf numbers taken under contention, floating props, characters that lose
the blind test. The FFXV-opus repo spent 133 commits turning art direction
into pixel-sampled numbers and post-processing into one composite; the MGS5
repo shipped a validated 60 fps with a measurement harness that caught six
lying instruments and an AI package better than our encounter brains; the
dead repos agree, independently, on three lessons — contact shadows kill the
"everything floats" tell, exposure must be closed-loop, and every blind test
was lost on **actor silhouettes, never environment**. The plan below is
ordered so the first wave fixes open defects with proven code, the second
raises the frame's ceiling, and nothing ports a system we already have a
working version of.

## 1. What we already have (port the delta, not the system)

Do not re-port these — every sibling has a version, ours is competitive or
better: Rayleigh/Mie/ozone LUT sky + volumetric clouds + cloud shadows + god
rays + aerial perspective; 7-level clipmap over a 2048² eroded heightfield
with 6-layer height-blended splat and Heitz/Neyret stochastic tiling; roads;
planar-reflection water; weather with rain/wetness/lightning; 3-ring grass +
tree impostors; a 13-pass post chain (TAA, bloom, DoF, SSR, GTAO, motion
blur, CAS, grade, exposure, contact shadows); rigged cast + 23-species
bestiary; combat + RPG + town + Regalia + dungeons; synthesized audio; and a
capture/check harness larger than any sibling's. What follows is strictly
the delta each sibling proved and we lack.

## 2. Wave 1 — proven fixes for defects already on our books

Each item here is wired to an open item in `project/archive/RESCUE-2026-08-21.md` or a handoff.

### 2.1 Determinism pinning (`__pinDeterminism`) — RESCUE §B1, the top item

MGS5's `window.__GAME.__pinDeterminism()` pins animator clocks, cascade
phase, exposure history and grain phase before a capture; it dropped their
screenshot noise floor **11× (RMS 5.20 → 0.23)** and made A/B diffs
falsifiable. Our #1 open defect — all 47 `follow` shots order-dependent
because formation never settles — is the same disease. Build `Party.snap()`
(RESCUE already locates the dead `Animator.rest()` at `Anim.ts:279`) **as
one piece of a general pin call** invoked from `Game.applyShot`, covering:
party formation snap, animator clock zero, TAA history rewind, exposure
history, weather/wind phase. Two harness-side fixes were already tried and
reverted; the sibling evidence says the fix belongs in-page, exactly like
this. *Difficulty: medium. Source: `metal-gear-solid-5-opus-demo/src/main.ts`.*

**DONE 2026-08-22 — and the diagnosis above was wrong in an instructive way.**
`Party.snap()`, `Animator.rest()`, per-shot `resetClock()` and `post.resetHistory()`
had all already landed before this session; they left a 1.836/255 residual against
a 0.302 floor. Two further causes, neither of them formation state:

- **The wind.** `Weather.resetClock` set only `_snap` (which skips the lerp toward
  the target preset) while `_gust` is integrated forever and drives `windStrength`
  through three sines, and `windDir` drifts permanently. Neither is part of
  `target`, so no preset change and no clock reset touched them. Probed:
  `windStrength` 0.840 on a page's first shot, 0.944 after one other. **This was
  the whole residual.**
- **Wall-clock streaming budgets.** Grass, scrub and trees each built tiles against
  `performance.now() + budgetMs`, so residency depended on machine speed and on
  what the previous camera had cached. Fixed with a `converge(camPos)` called from
  `Game.settle` after the first frame. Necessary, but worth only 0.009/255 on its
  own — it is the machine-independence that matters, not the number.

The lesson for the rest of this plan: the sibling evidence that the fix belongs
*in-page* was right, and the specific list of what to pin was incomplete. **Pin
every integrated phase, not the ones a handoff happens to name.**

### 2.2 Shader warm + compileAsync — kills the 15.8 s freeze class

Three repos independently paid for this lesson: FFXV-opus warms every
program at boot (an unwarmed SMAA cost a **677 ms mid-journey link**; "atomic
shader compiles can't be chunked — precompile, don't budget"); bablyon2
measured 350 ms first-draw compile *inside* a measured journey; MGS5's
`compileAsync` (KHR_parallel_shader_compile) bought −456 ms boot. We have the
15.8 s shader-compile freeze (content plan §0) and the 9.5 s
light-`visible`-toggle recompile landmine. Port: a boot-time `warm()` that
force-links every program behind the title screen, using
`renderer.compileAsync`, plus a check that no program links after
`GAME.ready`. *Difficulty: low-medium. Sources:
`final-fantasy-XV-demo-opus/src/render/Post.ts` (`warm()`), MGS5 boot path.*

### 2.3 `seatHeightAt` / `drawnEnvelope` — kills the floating-prop class

MGS5's terrain publishes what the renderer will *actually draw* at distance
(clipmap chord error reaches metres at coarse rings) so props seat on the
drawn surface's lower envelope. ~80 lines, killed their
floating-rocks-at-200–800 m bug class outright. We have the same class: the
Hammerhead apron sits 3.2 m above `heightAt` (landmine catalog), a floating
pickup in the garage, and props seated against the *simulation* heightfield
under a clipmap that draws something coarser far away. Port into
`src/world/Terrain.ts` beside `heightAt`, and re-seat prop placement through
it. *Difficulty: low. Source:
`metal-gear-solid-5-opus-demo/src/world/Terrain.ts` (`seatHeightAt`,
`clipSpacingAt`, `drawnEnvelope`).*

### 2.4 Self-validating perf ruler — RESCUE §B6 (re-baseline) done right

Every round-5 perf number here was taken under 6+ Chromium contention. MGS5
built the instrument for exactly this: paired frame differences against a
measured noise floor, `RULER_VALID: false` voids the run, a machine-
contention VERDICT line before measuring, "a median that moves less than the
IQR has not moved", refuse to print sub-noise numbers. Port into `perf.mts`
/ `gameplay.mts` before re-baselining, or the new baseline is as untrustworthy
as the old one. *Difficulty: low. Source:
`metal-gear-solid-5-opus-demo/tools/probes/perf.js`, `tools/bench.mjs`.*

### 2.5 Per-mesh/per-pass ablation dials — the diagnosis discipline

Both live siblings converged on ablation as the only honest localizer: MGS5's
`--hide <mesh>` / `--ablate <pass>` CLI flags overturned **eight** confident
visual diagnoses; FFXV-opus's `__ABLATE__` runtime dials let agents ablate on
a shared tree without rebuilding; bablyon's standing rule — "the first
diagnosis from looking at the frame was wrong, and an ablation was right —
measure before re-tinting" — was earned three separate times. We have probes
but no first-class ablation. Port: `?ablate=` page seam + `--hide/--ablate`
on `shoot.mts`, and write the rule into BRIEF/HANDOFF: **for any visual
defect, ablate before re-tinting.** Diff raw pre-post renders, not final
frames (post moves 40k px when you hide one mesh). *Difficulty: low.*

### 2.6 Contact shadows under actors — the "everything floats" tell

Bablyon2's blind panel had one dominant remaining tell: no contact-shadow
band under any actor or rock. FFXV-opus traced a 152 cm character
shadow-detachment to grass casting nothing (see 3.4), and MGS5 marches a
screen-space contact shadow along the sun as a *direct-light* occluder,
separate from AO. We have a contact-shadow pass in `src/engine/postfx/` —
before writing anything, **verify by capture** that it actually grounds the
party and bestiary at their feet at golden hour (the same "present but never
reached" failure hit the siblings repeatedly: specular occlusion gated on an
unbound aoMap, `setRenderScale` with zero callers, grade constants dead in a
constructor). If it doesn't ground them, MGS5's sun-marched version is the
reference. *Difficulty: low to verify; medium if it needs the rewrite.*

## 3. Wave 2 — graphics and art ceiling

### 3.1 Copy the measured art-direction corpus (trivial, do it first)

`final-fantasy-XV-demo-opus/docs/ART_DIRECTION.md` is 659 lines of
pixel-sampled FFXV PS4 reference: skin lit:shadow is only **2.0–3.2×** (a
physical sun/ambient ratio reads sooty — run a strong hemispherical fill on
characters); skin shadows stay warm while environment shadows push teal
(never global-shadow-tint characters); black leather medians Y≈8 and goes
*blue* from sky bounce; a boss against sky is a 1:10 near-black cutout that
**takes no aerial perspective**; noon sun ~45–48° elevation, never zenith;
half of every face is in shadow in every plate; Nomura facial proportions as
numbers; a measured HUD layout table. Copy it (plus `RENDER_INVENTORY.md`'s
present/absent/traps format and the REMASTER 21-trap list) into `docs/` as
reference material, and hold our character/creature art passes (RESCUE §B10,
§B11) against its numbers. Every dead repo lost the blind test on actors;
these are the only quantified actor targets anyone produced.
*Difficulty: trivial — copy files, adapt paths.*

### 3.2 Grade-vs-reference statistics + blind A/B with sealed keys

Two tools that turn "does it look like FFXV" into a measurement:
- MGS5's `tools/reference/imagestats.py` computes the same statistics (R−B
  split, black point, clipped %, saturation, stops) on reference frames and
  on ours; moving from compare-against-memory to nine measured frames
  **reversed three of their own grading targets**.
- FFXV-opus's `compare.mts` composites game vs reference with randomized
  sides and a *sealed* answer-key sidecar, so the judging agent genuinely
  doesn't know which is which; hesitation rate tracked across rounds.

RESCUE §B13 wants a fresh harsh-critic pass (last score 4.5/10, badly
stale). Port both first, then run the critic blind. *Difficulty: low.*

### 3.3 Grade upgrades — specific, numbered, cheap

Our grade pass exists; the siblings found the specific terms that separate
"tinted" from "graded". All are shader-constant-sized changes to
`src/engine/postfx/` grade/exposure:

- **Finite clip + shadow expansion, not lift** (MGS5's Fox-Engine PRINT
  curve, from the Courrèges teardown): identity below 0.6 so mids keep
  chroma, finite white clip so highlights actually reach 255 — "zero
  clipping is what makes frames read veiled". Slope-1.2 shadow *expansion*
  below a 0.06 knee instead of a lift pedestal.
- **Split-tone released above l≈0.80** (FFXV-opus): their "nothing in this
  game clips" bug was the highlight tint capping blue at 244. Check ours for
  the same cap.
- **Hue-gated warmth** (MGS5): warm the land via a tint gated *off
  already-blue pixels* so the sky stays blue; warmth lives on the sun, never
  a global multiply (nine stacked warm nudges once produced a measurable
  sepia filter).
- **Highlight desaturation before the tonemap** (film bleach) so hot pixels
  don't drive to their dominant primary.
- **Closed-loop exposure** (bablyon2 + MGS5, independently): key exposure
  off measured scene light with per-hour trim as a ±small-stop seatbelt.
  Bablyon2's open-loop time-of-day curve blew a played session to mean luma
  209/255; MGS5's irradiance-on-reference-albedo model made two shots at
  the same hour expose identically. Audit which loop ours runs.
- **Film grain after sRGB encode, fixed seed** (FFXV-opus): mid-weighted
  `4·l·(1−l)`; linear-space shadow-weighted grain caused 28/255 swings near
  black, and a per-frame-advancing seed is a crawling dither.

*Difficulty: low each; verify each against 3.2's stats, one change at a time.*

### 3.4 Depth-weighted additives + the creature/terrain haze split

FFXV-opus scales bloom skirt, god rays and aerial perspective by
`airDepth = 1 − exp(−dist/scatterLength)` — how much *air* sits in front of
a pixel. This is the measured fix for "sun-facing subject gets flooded
white" (god rays owned −9.53 luma of the flood). Paired with it:
`uAerialNear/uAerialNearEnd` implements the reference law that **creatures
pick up no haze while terrain at the same distance does** — the boss-vs-sky
1:10 cutout. Our aerial perspective and god rays exist; add the airDepth
weighting and the near-field haze suppression for characters/bestiary.
Daemon night readability (RESCUE §B11) is likely this lever, not albedo.
*Difficulty: medium. Source: `final-fantasy-XV-demo-opus/src/render/Post.ts`,
`RenderStack.ts:101-319` (grade/fog constants live in `tuneGrade`, with full
measured sweep tables in comments).*

### 3.5 Horizon-angle bake — km-scale terrain shadows for two fetches

FFXV-opus bakes 8 azimuth bins of max skyline elevation per texel (monotone
convex-hull sweep, O(8N), tens of ms at 513²) packed into two RGBA8
textures. Two fetches buy (a) kilometre-scale terrain sun-shadow that a
320 m CSM structurally cannot express, and (b) cosine-weighted sky-visibility
AO. Our shadow cascades cost **~22 ms and dominate the failing walk
segment** (RESCUE §B6); a horizon map lets distant terrain self-shadow
without cascades reaching further, and valley shade at golden hour is the
signature FFXV look. Runs in `bake.mts`, ships in the existing baked cache.
Their measured counter-intuitive: 1 centre ray per bin beats a 3-ray sector
max (MCC 0.929 vs 0.664). *Difficulty: low-medium. Source:
`final-fantasy-XV-demo-opus/src/world/terrain/skyOcclusion.ts`.*

### 3.6 Grass: tier-D handover, shadow proxy, root blend, coverage math

Four compatible upgrades to `src/world/veg/`:
- **Tier-D = no geometry**: past ~45 m a clump is smaller than a terrain
  texel — represent it as a terrain *material* layer sharing the same gust
  texture/uniforms so wind bands cross the seam (FFXV-opus). MGS5 agrees
  from the other side: "the honest LOD for a thing smaller than a pixel is
  to darken the pixel" — sub-pixel blades read as white confetti to every
  critic. Check what our outermost ring does past its last LOD.

  **Checked, 2026-08-23: past its last LOD our outermost ring does nothing.**
  `LODS` in `GrassField.ts` ends at `far: 155`, and beyond that there is no
  grass representation at all — the ground reverts to bare terrain material.
  Confirmed by ablation rather than by eye: `shoot zone_fallgrove --hide grass`
  makes the *near* ground take on exactly the pale mottled green the
  mid-distance already had, so the visible band across that shot is not a
  far-LOD albedo mismatch, it is the grass simply stopping. Tier-D is a real gap,
  not a speculative one. **Not built yet, deliberately:** the fix is a terrain
  *material* layer, and the atmosphere lane is rebuilding the grade, the cloud
  cover and aerial perspective right now. A ground tint matched to a grade that
  is being replaced would only have to be matched again afterwards.
- **Shadow-only sward proxy**: blades can't cast (6 mm ≈ 1/10 cascade
  texel); a coarse tuft mesh casts *only* (colour pass collapses verts to
  zero-area triangles, shadow pass via `customDepthMaterial` carrying the
  same wind chunks). Fixed their 152 cm character shadow detachment for
  3,660 tris. `layers`/`visible` cannot do this — three tests shadow
  visibility against the view camera.
- **Root-albedo blend**: sample terrain albedo at each blade root so grass
  roots into the ground — relevant to RESCUE §B7's grass-vs-`GROUND_BLEED`
  re-judging.
- **Coverage economics** (OGL repo): coverage = `1−exp(−λa)`; buy occlusion
  with blade *area* near the camera, not clump density — measured 46%→88%
  ground occlusion for +112k tris instead of +2M.

*Difficulty: medium. Sources: `final-fantasy-XV-demo-opus/src/world/grass/`
(esp. `shadowProxy.ts`, `terrainCanopy.ts`),
`final-fantasy-XV-demo-ogl-opus/src/world/grass.ts` header.*

### 3.7 Water depth model — Beer-Lambert + refracted bed

Our water is planar reflection only. Two proven additions: FFXV-opus's
**refracted depth without a scene copy** (one Snell step through the ripple
normal, re-sample the heightfield bed at the displaced point — tint, alpha
and silhouette keyed on exact metric depth), and the OGL repo's diagnosis of
why water reads as sand: two-stop color ramps instead of Beer-Lambert
`exp(−σ·depth)` with σ_red ≫ σ_blue, and foam stamped as a contour instead
of derived from flow. SCOPE's rivers/waterfalls backlog should inherit this
model. *Difficulty: medium. Sources:
`final-fantasy-XV-demo-opus/src/world/water/`,
`final-fantasy-XV-demo-ogl-opus/src/world/water.ts` header.*

### 3.8 Sky-SH ambient + PCSS (evaluate, don't assume)

Two MGS5 pieces to *evaluate* against our sky: (a) diffuse ambient as an L2
SH `LightProbe` projected from the live sky with the env cube demoted to
specular-only — "shadow color IS sky color by construction", and it can't
double-count (FFXV-opus found the unshadowable probe was their
shadow-killing ambient flood; ours may share it — cheap ablation test).
(b) PCSS (blocker search + Vogel disc) via `shadowmap_pars_fragment` chunk
override for contact-hardening penumbras. Both are golden-hour levers.
*Difficulty: medium; measure first. Source:
`metal-gear-solid-5-opus-demo/src/render/Lighting.ts`.*

## 4. Wave 3 — performance

- **Frame-cost split before optimizing** (MGS5): measure pixel-scaled vs
  fixed cost first (theirs was 17.8 + 7.4 ms — no post deletion could
  reach 16.7). Decides whether our walk-segment fix is shadows, post
  consolidation, or render scale. Also steal: motion blur whose early-out
  never fires is inert-but-not-free — audit our motion-blur gate.
- **Post consolidation** (FFXV-opus): their explicit rationale — 8 full-res
  passes cannot hold 60 fps at DPR 1.5 — led to one full-res composite
  draw with reduced-res inputs. We run 13 passes. Only worth it if the
  cost split says post is the binder; if so, their `Post.ts` is the map.
- **Draws, not triangles** (MGS5, measured): splitting clipmap rings into
  cullable blocks was −12% tris, +18% draws, *worse* frame — the scene is
  submission-bound. Our budget headroom (351–506 of 800) is the metric that
  matters; resist triangle-shaving that adds draws.
- **InstancedMesh culling traps** (MGS5): one world-spanning bounding
  sphere is never frustum-culled and resubmits per cascade; a sphere
  containing the eye is inside every frustum. Audit our prop/veg tile
  streaming for both.
- **Chunked-work discipline** (FFXV-opus `app/chunk.ts`): "a yield that
  cannot draw" — `scheduler.yield()`, never `nextFrames(1)` with the rAF
  loop live (each yield renders a full frame against a half-built world).
  Relevant to TODO.md's slow page start; pair with 2.2.
- **GenCache generator-hash invalidation** (MGS5): our bake cache
  invalidates manually; theirs keys blobs on a vite-injected hash of the
  generator source (edit terrain → exact invalidation), atomic writes, LRU.
  11.6 s erosion → 360 ms fetch. Nice upgrade to `bake.mts`/`daemon.mts`,
  not urgent. *Difficulty: low.*
- **AI cost control** (MGS5), for when encounter density rises: senses on a
  rotating schedule with per-guard wall-clock dt (population-independent
  detection), one A* per frame globally, LOS as a heightfield march (never
  a Raycaster), connected-components flood fill at bake so reachability is
  an O(1) label compare. **40 active guards = CPU animation at the noise
  floor — garrison cost is geometry, not animation.**

## 5. Wave 4 — gameplay systems worth adapting

- **Detection-as-meter + alert ladder** (MGS5 `src/ai/`): perception meter
  (never a boolean) with angular/acuity/attention/stance/shadow/night
  terms; CALM→CAUTION→ALERT→EVASION ladder over one `report()` blackboard
  carrying **last-known position + heading** — nobody ever knows where the
  player *is*. Our encounters have sight/hearing aggro and flanking; this
  is the upgrade that makes night daemon pressure and imperial MT drops
  play like stalking instead of aggro-radius. Add the one-line
  `vegetationDensityAt` concealment term MGS5 never wrote — we have real
  grass. Cleanly layered: guards drive characters via a 4-field contract.
- **Cover + fire rhythm** (MGS5 `guard.js`, `combat.js`): cover scored as
  *between* self and threat; fire model with three player-exploitable gaps
  (aim settle, magazine → 2.6–3.4 s head-down reload, burst rests);
  hit-chance ladder rewarding movement between bursts; misses land *near*
  and feed suppression VFX. Direct fit for MTs and gun-daemons.
- **Sphere-swept camera collision** (MGS5 `PlayerCamera.ts`): r=0.30 m
  swept against obstacles+terrain in one pass — a point test left the lens
  inside geometry in 4.8% of poses. Our CameraRig surely has the same
  disease in dungeons and Hammerhead interiors. `lookScale()` (tangent-
  ratio mouse invariance under FOV change) also applies to our sprint FOV
  kick and warp-strike aim.
- **Animation rate contract** (FFXV-opus, final commits `6730b65`,
  `78f3487`): rigs must take sim-rate motion via `setMotion()`, never
  differentiate the interpolated render transform (chest swung 15°/frame
  with 63% sign flips under a fixed-step accumulator). Read before any
  posture/gait work — RESCUE §B2's unverified posture merge should be
  checked against exactly this failure (sign-flip-rate is the metric:
  "a signal reversing on 40–50% of frames is vibrating").
- **Adaptive music re-targeting** (both siblings): stems whose gains
  re-target on combat events ("the entire difference between adaptive
  music and a music switch"); MGS5's measured gain-staging (Blink's
  compressor eats transients ~8 dB below threshold) and wind level read
  from the vegetation shader's actual wind uniform — you hear the gust you
  see. Our audio system is strong; these are tuning-level upgrades.

## 6. Methodology to adopt (write into HANDOFF/BRIEF, costs nothing)

1. **Ablate before re-tinting.** Earned independently in three repos.
   Apparent art problems are usually arithmetic/engine bugs.
2. **Per-shot noise floors.** FFXV-opus measured 0.06 on a vista and 4.73
   on a party-walk shot — 77×. Our global 1.58–1.99 floor in `imgdiff.mts`
   is wrong on both ends; make it per-shot.
3. **Shipgate vs corpus** (gpt-5-6): one battery on a final build proves
   the build; only a multi-seed corpus catches reliability variance (4/42
   of their runs still failed after a 14/14 shipgate). Our `gameplay.mts`
   is a shipgate; consider a seed sweep.
4. **"Present but never reached" is the dominant failure class.** Both
   siblings repeatedly built features with zero callers (SSS dead 4
   rounds; `setRenderScale` documented 5 rounds, never called; our own
   RPG layer was 5,765 dead lines). `orphans.mts` catches dead *modules*;
   consider an audit for dead *uniforms/paths* — FFXV-opus's shader-audit
   pattern (every injection registers a marker; a frame reports
   compiles/injections/failures) exists because CSM silently overwrites
   `onBeforeCompile`.
5. **Metrics have blind spots by class** (FFXV-opus): an area metric
   cannot see an area-preserving bug (a transposed impostor UV survived
   four rounds of area checks). Port their two tiny guards:
   coverage-preserving alpha mips (`app/coverageMips.ts` — box mips
   re-seal alpha silhouettes into blobs; includes the floor-vs-ceil bug)
   and the O(1) impostor orientation assert (`geom/impostor.ts`).
6. **Judges mis-report absence** (3× in FFXV-opus): keep a
   RENDER_INVENTORY-style present/absent table so critic claims of
   "missing feature X" can be killed in one lookup.
7. **Sky constants that transfer**: normal bias held constant in shadow
   *texels* not metres (0.35 m was 6.8 texels on cascade 0 and 1.2 on
   cascade 2); sun arc tilted so noon caps ~48° elevation (reference
   never lights from zenith); storm *closes* the aperture; atmosphere math
   in kilometres because float32 can't resolve the horizon in metres;
   ozone over-driven ~2.5× as the cheap multiple-scattering stand-in or
   blue hour goes brown (OGL repo — both blind judges called that sky
   finished); if fog and dome are computed separately, derive fog colors
   by running the same scattering integral on CPU — the only way they
   agree at the horizon with no seam.

## 7. Anti-ports — audited and rejected

- **TAA from FFXV-opus** — fully built there and deliberately OFF: −7.3%
  crawl for −49% Laplacian sharpness failed its own gate. Ours works;
  don't revisit on their evidence.
- **MGS5's terrain fragment shader wholesale** — 1300 lines welded to its
  bakes and 16-sampler ceiling, and its biggest per-pixel cost (~4.6 ms).
  Read it only for `sharpnessK` (screen-footprint layer fade) and the
  debug/perf uniform split.
- **MGS5's AO pass as-is** — self-described as needing a rewrite; root
  cause of four separately-filed defects.
- **MGS5's `Obstacles.ts`** top-down height bake — right for one compound,
  wrong for an open world.
- **Their clipmap/erosion/splat/sky cores** — we have equivalents; port
  constants and lessons (§6.7), not systems.
- **Anything from the Babylon repos' code** — engine-specific; the lessons
  files (`bablyon2/docs/STATE.md`, `bablyon/docs/ROUNDS.md`) are the
  salvage, already distilled above.
- **Procedural-actor ambitions** — every one of six repos lost the blind
  test instantly on actor silhouettes. The portable response is 3.1's
  measured targets + 2.6's grounding + 3.4's haze split (composition
  levers), not another rig rewrite.

## 8. Suggested order and ownership shape

Wave 1 items are independent and small — each is a single-agent task with
an existing RESCUE line item as its DoD. Suggested order: 2.5 + 2.4
(instruments first — everything after is measured with them), then 2.1,
2.2, 2.3, 2.6. Wave 2 starts with 3.1/3.2 (documents + measurement, no
code risk) and then takes 3.3–3.8 one lever at a time, each verified by
blind A/B (3.2) before the next. Waves 3–4 are backlog: pull items when
their trigger fires (perf re-baseline result for Wave 3; encounter/content
work for Wave 5's AI pieces).

## 9. Landmines specific to this porting work

- Sibling repos are **TypeScript**; we are ES modules, no TS (BRIEF rule
  6). Port by translation, not file copy — except pure GLSL, which moves
  verbatim.
- FFXV-opus's live grade constants are in `RenderStack.tuneGrade()`, *not*
  the `Post.ts` constructor — their own famous trap. Read the right file.
- Their measured constants assume their exposure/tonemap context. Port the
  *structure* and re-tune against 3.2's reference stats; blind-copying
  numbers across different tonemaps is how their sepia-filter bug happened.
- `NUM_POINT_LIGHTS`-style program cache keys: adding lights or changing
  light counts recompiles every program — interacts with our 8-light
  pinned pool (`engine/LightBudget.ts`) and the 9.5 s recompile landmine.
- The audits live in agent reports, not in the sibling repos' READMEs.
  When implementing an item, **read the cited source file** — every § here
  names its file; do not implement from this summary alone.
- Machine contention: the sibling harness lessons double ours — never
  measure with another agent's Chromiums up (`shot status`-style verdict
  line is itself item 2.4).

## 10. Definition of done for this plan

Ticked 2026-08-23 against the tree. **4 of 6.**

- [x] Wave 1 items each closed against their RESCUE line item, with
      captures looked at. *(2.6 closed as "present and insufficient", which
      is a close, not a pass — the work moved to `handoff/grounding.md`.)*
- [x] `docs/ART_DIRECTION`-equivalent reference numbers exist in `docs/`
      and the next character-art pass cites them. *(`docs/reference/`.)*
- [x] Blind A/B harness runs with a sealed key; fresh critic pass recorded
      (replaces the stale 4.5/10). *(`compare.mts`; ten rounds; 4.5/10 is
      now a **current** number with a control, not a stale one.)*
- [ ] Perf re-baseline published from the new ruler with noise floor and
      contention verdict attached. **Blocked, not forgotten:** the ruler
      exists and correctly refuses a contended tree, and the tree has not
      been quiet long enough to certify one. This is the single most
      load-bearing open item in the repo — two perf gates are formally
      unmeasured.
- [ ] Each Wave 2 lever landed (or rejected with a measured negative —
      record it, the siblings' measured negatives were half their value).
      **4 of 8 landed** (3.1, 3.2, 3.5, and 3.6 as a recorded negative);
      3.3, 3.4, 3.7 and 3.8 are untouched.
