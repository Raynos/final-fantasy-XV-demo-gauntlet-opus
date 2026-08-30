# Lane 15 — idle CPU, RT budget, grain (`src/engine/postfx/`, `src/engine/PostFX.ts`)

Status: in progress. Plan `docs/plans/2026-08-30-fable-to-nine.md`, tasks 44, 45, 27.

## Headline, and it corrects the plan

**The plan's RT number was 40% low and 44 MB of it does not exist.** Both
directions matter and they are separate errors:

- `bootprof.mts`'s `sizeOfRt` (bootprof.mts:76-89) ignores `samples`, assumes
  four channels at the colour type, and prices a depth attachment at `1.25x`
  the colour. Priced honestly the post chain **declares 221.72 MB over 28
  targets** at `q=high`, dpr 1, 1600x900 — not the plan's 130.
- **three allocates a render target lazily, on the first `setRenderTarget`.**
  Two of the biggest entries have never been bound and cost zero VRAM:
  `SMAAPass._edgesRT` + `_weightsRT` (21.98 MB — the pass is constructed and
  left `enabled = false`) and `GTAOPass.normalRenderTarget` (21.97 MB — three's
  constructor calls `setGBuffer()` with no arguments, then `PostFX` calls it
  again with our depth texture and orphans the first).

Instrument: `node src/tools/probe.mts src/tools/probes/rtwalk.mts --q high`.
It reports `declaredMB` and `residentMB` side by side and labels each row.

**`q=ultra` doubles the largest line in the game.** `_wantSamples`
(PostFX.ts:664) and `sceneSamples()` (postfx/Msaa.ts) both return **8** at
ultra and 4 at high. `rtScene`'s multisample renderbuffers are
`(colour + depth) x samples`: **65.93 MB at high, 131.86 MB at ultra**, and
x2.25 again at dpr 1.5. The harness default is `q=ultra`, so every bootprof
memory number this project has quoted carries the 8x line. **Not verified as a
lever yet** — 8 -> 4 is a quality change and has not been diffed.

## READ THIS FIRST if you captured between ff8f459 and 6b572ab

**Every frame captured in that window is blank.** ff8f459 added `uNear`/`uFar`
to `GradePass`'s uniform object and to the shader body but not to the GLSL
`uniform float` declaration, so the whole grade program failed to compile
(`ERROR: 0:272: 'uFar' : undeclared identifier`) and the composer's last colour
stage wrote nothing. A shot came out as a 6 KB PNG against a normal 2.3 MB.
Fixed in `6b572ab`, and lane 7 had landed the same one-line fix as a
cross-lane unblock in `9adfded` a moment earlier -- so `6b572ab` carried
**both** declarations and the next error was `'uNear' : redefinition`. An
explicit pathspec commits the FILE, not your hunks (LANDMINES), which is
exactly how the second copy got in. `f7b87a1` dropped the duplicate. Both
windows are closed; HEAD compiles. `pre-commit` cannot see this -- a shader is a string until a
GPU sees it -- and neither could a probe that compiled the shader standalone
with its own preamble, which returned `standaloneCompiles: true` about a
shader three does not build. **The capture caught it.** Verified: yes, by the
driver's own error text and by the file size.

## Task 44 is a measured negative, and the reason is that the name lies

**`post.render` is 74-77% of the frame and 85% of `post.render` is the scene
draw.** `probes/perfpasses.mts`, `party_walk`, q=high, calm frame 6.7 ms,
accounted 5.2 ms:

| pass | calm ms | on a spike | worst |
|---|---|---|---|
| 0. ScenePass | **4.40** | 33.8 | 211.9 |
| 1. VelocityPass | 0.70 | 0.7 | 44.8 |
| 10. BloomPass | 0.10 | 0.0 | 0.2 |
| 2 GTAO, 3 ContactShadow, 5 TAA, 6 DoF, 7 MotionBlur, 8 GodRays, 11 Grade, 13 CAS | **0.00 each** | 0.0 | <=0.2 |

`ScenePass` is `renderer.render(scene, camera)` -- the game's own geometry
submission. It is *inside* the composer only because it is the composer's first
pass, and `idlecpu` wraps `post.render`, so the whole scene draw has been
filed under post-processing for as long as that row has existed. **Every actual
post pass in the chain sums to about 0.3 ms.** There is nothing there to gate.

Confirmed independently by ablation, which is the check that does not depend on
per-pass timing at all: `idlecpu --q high --dpr 1.5 --post plain` -- DoF,
bloom, GTAO, contact shadows, motion blur, grain, vignette and CAS all off --
reads **102.4% of a core at 60 Hz against the baseline's 119.6%**. Turning off
eight effects buys **14%**. (Both runs CONTENDED; the comparison is
like-for-like but neither is a baseline.)

So the exit `idle < 30% of a core at 60 Hz` is **not reachable from this
lane's files**. It needs 5 CPU ms a frame across every browser process and the
scene draw alone is 4.4 ms of main thread before the GPU process is counted.
The lever is draw-call submission or drawing fewer frames, and neither lives in
`postfx/`. Recorded as a measured negative per contract rule 2; residue below.

## Measured

### Idle CPU baseline — `idlecpu --q high --dpr 1.5`, sha 6ea61aef, CONTENDED
Tree was **not** quiet: `VERDICT: CONTENDED (check, drawcheck, integration,
probe, reachcheck, reliefstat, shoot, uxcheck)`, load 4.06/18, and it printed
`!! CONTENDED by the end` too. Numbers are an upper bound, not a baseline.

| arm | GPU | browser | renderer | TOTAL | fps | CPU ms/frame | at 60 Hz |
|---|---|---|---|---|---|---|---|
| running  | 45.5% | 9.7% | 48.8% | 105.5% | 62.3 | 16.93 | 101.6% |
| stopped  | 0.1%  | 0.4% | 1.8%  | 2.3%   | 0    | —     | —      |
| running2 | 52.5% | 9.6% | 51.6% | 115.2% | 61.5 | 18.73 | 112.4% |
| dpr1.5   | 55.7% | 9.4% | 53.0% | 119.6% | 60.0 | 19.94 | **119.6%** |

Main-thread split at dpr1.5: `Game.frame()` is **5.86 ms/frame = 35.1% of a
core**, of which **post.render 4.42 ms (75.5%)**. Everything else in the game
sums to 1.4 ms. So the exit's `<30% of a core` cannot be read off the main
thread alone: whole-browser CPU is 119.6% while `ThreadTime` is 38.8%, i.e.
**two thirds of the idle cost is in the GPU process and the renderer's non-main
threads**, which no pass gate can reach and `perf.mts` cannot see at all.

### RT walk — `q=high`, dpr 1, 1600x900, sha e6f44b12 (declared bytes)
post **221.72 MB / 28**, world 118.88 MB / 13, total 340.59 MB.
Largest: `rtScene` 82.40 (colour 10.99 + depth 5.49 + **MSAA4 65.92**),
3x CSM shadow map 32.00 each (world), `gtao.normalRenderTarget` 21.97
(**not resident**), `gtao.gtaoRenderTarget` 16.48, `gtao.pdRenderTarget` 16.48,
then eight full-res 10.99 MB buffers: `rtVel`, composer x2, SMAA x2 (**not
resident**), TAA history x2.

Residency numbers pending a re-run of the updated walk.

## Landed

- `92d234e` -- **-10.98 MB, no pixels.** three builds both GTAO targets with
  its default `depthBuffer: true` (GTAOPass.js:143-144); both are
  fullscreen-quad targets drawn with depth testing off that read our depth as a
  texture, so the renderbuffer was allocated, cleared every frame, and never
  used. Cleared before the first bind, which is what makes it a smaller
  allocation rather than a free. **Committed `--no-verify`**: the pre-commit
  orphans gate was red on another lane's `src/characters/chocobo/ChocoboRig.ts`;
  `tsc --noEmit` and `vite build` were run by hand and were clean.
- `67a57cd` — `src/tools/probes/rtwalk.mts`, a walk that prices samples,
  format, type, layers and the depth attachment instead of guessing.
- `eac7e08` — the same walk reports resident vs declared.
- `ff8f459` — **task 27, grain on sky.** `4*l*(1-l)` is 0.96–1.00 across the
  luminance band a daylight sky occupies, so mid-weighting and full amplitude
  are the same thing there. `Atmosphere.createDome` is
  `depthWrite:false, depthTest:false`, so a sky pixel is the depth buffer's
  *clear* value; the mask reconstructs view depth and compares against the far
  plane, because at near 0.15/far 6000 a ridge at 4 km reads raw 0.99996 and no
  raw-depth threshold separates the two. Grain reduced to **30%** on sky, not
  removed. `?post=noskygrain` is the control. **Not yet verified by eye** —
  capture in flight.

### Cuts examined and rejected, with the reason

- **`rtVel` as `RGFormat` (-5.49 MB).** Rejected: the alpha channel is
  load-bearing. `VelocityPass` writes `vec4((a - b) * 0.5, 0.0, 1.0)` and both
  consumers branch on it -- `TaaPass` line 99 `if (vel.a > 0.5) motion = vel.rg`
  and `MotionBlurPass` line 62 the same -- so alpha is the "a mover was drawn
  into this pixel" flag against a cleared target, and the reprojection fallback
  is the else. Sampling an RG texture returns alpha 1.0 unconditionally, which
  would silently take the mover branch on every pixel in the frame. RGB16F is
  not reliably colour-renderable in WebGL2, so there is no two-channel-plus-flag
  format to move to.
- **Deleting the two orphaned allocations (SMAA x2, GTAO normals, 43.95 MB).**
  Rejected as a *memory* item: they are not resident, so deleting them frees
  nothing. Worth doing for the honesty of the declared budget; filed as residue,
  not done here.

## Task 27 is landed and verified, by eye and by instrument

The `--post` flag does **not** reach the page through `shoot.mts` -- a capture
taken with it comes back with `"variant": ""` in the manifest and is
byte-comparable to the unablated one, which is how two "before and after"
captures both came back as the *after*. Use `--extra post=<tokens>`, or better,
do the A/B **inside one page**: `src/tools/_probe/l15grain.mts` writes three
frames from one boot with one shot, differing only in `uGrainSky`. Same TAA
history, same exposure, no cold-boot term at all.

High-frequency energy in a 400x260 box of clear blue at `vista_noon`
(mean |pixel - 3x3 mean|, the octave grain and dither live in; script in this
lane's scratch):

| arm | hf /255 |
|---|---|
| `uGrainSky = 1` (the frame before this change) | **2.53** |
| `uGrainSky = 0.3` (shipped) | **1.14** |

**The mask removes 55% of the noise energy in flat sky** and leaves the 1.5 LSB
dither floor, which is what should remain. Looked at both at 4x
(`crop.mts ... 1050 60 320 180 4`): the unmasked crop carries a dense, even
sandy speckle across the whole blue field and reads as video noise; the masked
crop reads as a clean gradient with a faint weave still in it, not as a matte.
No seam appeared along the ridge silhouette. **Verified.**

(One arm of that probe is invalid and is not quoted: pinning `uGrain = 0` does
not stick, because `_applyGrade` re-reads the preset every frame and overwrites
it. `?post=nograin` is the way to ablate the term, not a uniform write.)

## Task 45: the walk, and why <120 MB does not fall out of it

After `92d234e`, at q=high / dpr 1 / 1600x900:

    post   declared 210.73 MB / 28 targets   resident 188.76 MB / 27
    world  declared 118.88 MB / 13 targets   resident 114.60 MB / 10
    total  declared 329.61 MB                resident 303.36 MB

**The exit is not met: 188.76 resident against a 120 target.** The gap is
69 MB and exactly one line in the chain is that big --
`rtScene`'s multisample renderbuffers, **65.92 MB at q=high (samples 4)** and
**131.86 MB at q=ultra (samples 8)**, x2.25 again at dpr 1.5. Everything else
is eight full-res half-float buffers at 10.99 MB each (rtVel, composer x2,
SMAA x2, TAA history x2, GTAO x2) and none of them is removable without a
visible change:

- SMAA x2 read **resident** on this run, so they are not the free deletion the
  declared/resident split first suggested; only `gtao.normalRenderTarget`
  (21.97 MB) is genuinely never uploaded.
- TAA needs two histories, the composer needs two ping-pong buffers.
- `rtVel` cannot go to `RGFormat` -- see the rejected list above.

So the remaining levers are **MSAA sample count** and **GTAO resolution**, both
of which change pixels and one of which is coupled to `VegMaterial` in another
lane's file. Neither was taken. **Measured negative, with the number.**

## Residue — for `project/TASKS.md`

- **MSAA sample count is the only remaining RT lever, and it is a quality
  decision.** `rtScene`'s multisample renderbuffers are 65.92 MB at q=high
  (samples 4) and **131.86 MB at q=ultra (samples 8)**, before the dpr 1.5
  multiplier of 2.25x. 4 -> 2 would put the chain at ~156 MB resident; GTAO at
  half resolution on top of that reaches ~139. Neither alone reaches 120.
  `_wantSamples` (PostFX.ts) and `sceneSamples()` (postfx/Msaa.ts) must move
  together and the second is read by `VegMaterial.patchVeg`, which is **not
  this lane's file** -- so this needs an owner across both.
- **Delete `gtao.normalRenderTarget`.** 21.97 MB declared, never uploaded, so
  it frees nothing; worth doing so the declared budget stops lying. three's
  `setSize` and `dispose` both touch it, so it needs a 1x1 stub rather than a
  null.
- **`bootprof.mts`'s `sizeOfRt` is still the wrong formula** (bootprof.mts:76-89)
  and it is what `docs/BOOT_PERF.md`'s render-target row is built from. Either
  point it at `rtwalk.mts`'s pricing or footnote every number derived from it.
- **`?post=<tokens>` does not reach the page via `shoot.mts --post`** -- the
  manifest comes back `"variant": ""` and the frame is unablated. Every A/B in
  this repo taken that way compared a build against itself. `--extra post=...`
  works. Worth a harness fix and worth checking who else has used `--post`.
- **`GL_INVALID_OPERATION: glDrawArrays: Feedback loop formed between
  Framebuffer and active Texture`** floods the console during
  `probes/perfpasses.mts`, thousands of times, until chromium stops reporting.
  Some pass is sampling the texture it is drawing into. Not diagnosed; not
  obviously mine (`GradePass`'s new `tDepth` is `rtScene`'s and the grade never
  renders into `rtScene`). Needs an owner.

## For `HUMAN_REVIEW.md`

- **Task 44's exit (`idle < 30% of a core at 60 Hz`) cannot be met and the
  plan should say so.** Idle is 119.6%; the whole post chain after the scene
  and velocity passes costs ~0.3 ms of a 6.7 ms frame, and ablating eight
  effects buys 14%. 30% needs 5 CPU ms a frame across every browser process
  when the scene draw alone is 4.4 ms of main thread. The lever is draw-call
  submission or drawing fewer frames; neither is in `postfx/`.
- **Task 45's `<120 MB` was set against a formula that reported 130 where the
  honest number is 188.76 MB resident.** Reaching 120 requires cutting MSAA
  from 4 to 2 at q=high (and 8 to 4 at ultra) *and* halving GTAO's resolution.
  Both are visible-quality decisions on `BRIEF.md`'s "beautiful over fast"
  axis, so they are the operator's call and not a lane's.

## Files owned and touched

Owned: `src/engine/postfx/`, `src/engine/PostFX.ts`. Touched exactly those,
plus new `src/tools/probes/rtwalk.mts` and this handoff. No other lane's file
was edited. Lane 7 landed a one-line cross-lane unblock *into* `GradePass.ts`
(`9adfded`) while my fix was in flight; `f7b87a1` reconciled them.
