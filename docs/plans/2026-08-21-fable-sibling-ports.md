# Sibling-repo port plan — techniques worth stealing

Status: DONE (2026-08-25, opus) — **6 of 6. All four waves closed, the perf
re-baseline published and passing.** Third opus pass. What is left over is
re-filed in §10's last table, and Wave 3's frame-cost split goes to phase4's
WS-0b with the ruler defect that stopped it being measured here. This table
replaces the previous one, which had **five** rows wrong — 3.6 (three of its
four items), 3.8(b), Wave 4's `setMotion` contract, Wave 4's adaptive music,
and the attribution of the shadow-warmth gap in 3.8(a). Every one of them
called something open that was closed, or blamed a gap on a lever that cannot
reach it. See "the pattern, now with five more instances" below: **how they
were wrong is still the more useful half.**

| item | state | evidence |
|---|---|---|
| 2.1 determinism pinning | **DONE** | `417ca86`. 1.836 -> 0.340 mean/255 against a 0.302 floor. The cause was the wind, not the formation the plan predicted |
| 2.2 shader warm + `compileAsync` | **REJECTED, measured** | `4c1d813`. `compileAsync` is 3% slower here (1562 ms sync vs 1611 ms, six pairs) |
| 2.3 `seatHeightAt` / `drawnEnvelope` | **DONE** | `Terrain.ts:496`, `props/Seat.ts`, `seatcheck.mts` |
| 2.4 self-validating perf ruler | **DONE**, and the lease with it | `RULER_VALID` in `perf.mts` / `gameplay.mts`; `43531db` made the quiet lane queueable, see below |
| 2.5 ablation dials | **DONE**, and extended twice | `--hide/--ablate`; `nobleach`, `noactorhaze`, `noambient`, `noenv`, and this pass `noprobe` |
| 2.6 contact shadows | **CLOSED as insufficient** | grounding is structural and past every term's range; `handoff/grounding.md` owns it |
| 3.1 art-direction corpus | **DONE** | `docs/reference/` |
| 3.2 grade stats + blind A/B | **DONE** | `compare.mts`, `imagestats.mts` |
| 3.3 grade upgrades | **DONE, 6 of 6 levers** | `05fa8fb`, `6041077`, `e17e265` |
| 3.4 depth-weighted additives | **DONE** | `70506db` |
| 3.5 horizon-angle bake | **DONE** | `world/terrain/Horizon.ts` + `horizoncheck` |
| 3.6 grass tier-D et al | **DONE, 3 of 4 — and it was recorded as unbuilt** | tier-D sward *and* dry cover are in `TerrainMaterial.ts:1231`, wind-coupled and with their own measured near-negative; the shadow proxy is `GrassField._tileFor`; the root-albedo blend is `GROUND_BLEED = 0.34`. Only coverage economics is unverified. See below |
| 3.7 water depth model | **DONE — and audited wrong twice** | `Water.ts:15-43` |
| 3.8(a) sky-SH ambient | **BUILT and measured** | `bdbd7c5`, `43bcec6`, `ebb5462`. `world/sky/SkyProbe.ts`. What it fixed is not what it was predicted to fix — see below |
| 3.8(b) PCSS | **EVALUATED: half shipped upstream, half unreachable** | three 0.185's own PCF path is already Vogel disc + IGN. The blocker search is not buildable here — see below |
| Wave 3 (perf) | **five of six closed; the frame-cost split re-filed to phase4 WS-0b** | the re-baseline is published and passing; the split voided twice on a contended box and is not worth faking — see §10 |
| perf re-baseline | **PUBLISHED and PASSING** | `RULER_VALID: true`, floor 16%, mean 218.1 fps, worst 140. `bestiary_necromancer` 51 -> **172 fps**: the old failure was the machine |
| Wave 4 (gameplay) | **COMPLETE** | swept camera `fd1a153`, `lookScale` `347b392`, concealment `77555a7`, cover + fire rhythm `b29d566`, rate contract measured `4c2c8de`, adaptive music already built and now verified |
| §6.2 per-shot noise floors | **DONE** | `9db4548` |

### The pattern, now with five more instances

Three of this plan's audit rows had already been wrong in the same direction —
an item called open that was closed. This pass found five more, and the shape
is now specific enough to be actionable:

- **3.6.** Recorded as "Not built yet, deliberately: the atmosphere lane is
  rebuilding the grade". The grade landed, and tier-D landed with it —
  `TerrainMaterial.ts:1231` has the sward *and* a second dry-cover term for
  Leide, both patchy at clump scale, both taking the wind from the same uniform
  objects the blades sway on, with per-zone eyedropper measurements and a
  recorded near-negative in the comments. The root blend and the shadow proxy
  were there too. **Three of four, and the plan's own note about why it was
  deferred outlived the deferral.**
- **3.8(b).** Recorded as "not evaluated at all", with Vogel disc named as
  something to port. three 0.185 ships Vogel disc + IGN in
  `shadowmap_pars_fragment`'s own `SHADOWMAP_TYPE_PCF` branch — five taps with
  hardware PCF, ~20 filtered taps. Half the item arrived in a dependency bump.
- **Wave 4's `setMotion` contract.** Recorded as untouched. `Anim.update` is
  *handed* `st.speed` and `st.velocity`; `Player` and `Party` both build
  velocity from the sim's own heading and speed; nothing under
  `characters/rig/` differentiates a transform. Now measured rather than read:
  `probes/ratecontract.mts`, worst sign-flip rate **8.3%** against the 40-63%
  a differentiating rig sits at.
- **Wave 4's adaptive music.** Recorded as untouched, tuning-level.
  `Score.setIntensity` re-targets every layer gain with `setTargetAtTime`
  inside a state, and `AudioSystem` drives it from enemy proximity and
  remaining HP. Both halves: the wind level is already read from
  `Weather.windStrength`, the *same value* that feeds `veg.setWind` on the same
  tick, so you do hear the gust you see.
- **3.8(a)'s premise.** Not an item this time but a *diagnosis*: the handoff
  said the daylight grade's last miss was shadow warmth and "the rest is the
  ambient probe". It is not, and could not have been — see below.

**Four of the five were findable by reading the file.** The fifth was findable
by one ablation. The cost of not doing either is a plan that files completed
work as open for two more sessions.

### What 3.3 actually was, and why the last audit misread it

The previous audit called 3.3 "measurably still open: four of our six frames
clip at exactly 0.00%". **That was stale by the time it was written** — only
`storm` (0.00%) and `zone_longwythe` (0.04%) did, and our median clip% was 0.71
against the reference's 0.50. Re-measure before quoting a plan's own grievance.

The real defect was next door and structural: the print `fade` was applied flat
instead of to the shadows its docstring claims, which capped display-white at
252 for `golden` and `storm` and 245 for `night`. **No pixel leaving the LUT
could reach 254 by construction.** Found by tracing display-white through the
baker offline, not by looking at a frame.

Two of the six levers were already built (hue-gated warmth as `highGate`;
closed-loop exposure, which `Exposure.ts` has run all along, banded around a
Sky-published scene exposure). Two more landed as written. And two landed only
after a measurement overturned the plan's own prescription:

- **The plan says to fix golden-hour warmth in the tint.** Ablation says three
  quarters of it (+39.2 of +52.0 highlight R-B) survives `?post=nolut` — it is
  in the HDR buffer, so no display-referred tint could reach it. The fix is a
  scene-linear film bleach before the tonemap.
- **The toe.** Mid-weighting the grain, a cosmetic-looking change, revealed
  that shadow-weighted grain had been dithering dark pixels down and flattering
  the black point by 4 levels. The lift pedestal underneath was real.

Net across six graded shots: median range **9.46 -> 11.06 stops** (reference
9.79), black point 3.5 -> 1.1 (3.4), and the daylight slice now passes 8 of 9
checks against the FFXV field corpus.

### A third audit row that was wrong, and the pattern in it

3.7 was recorded as "NOT DONE — no Beer-Lambert, no refracted bed" by the
previous audit, and **restated as untouched by this one** before being read
properly. It is completely built, and has been for some time; the grep that
"confirmed" it absent had in fact matched `Water.ts` and been misread as merely
listing the file.

Three of this plan's audit rows have now been wrong in the same direction — an
item called open that was closed, or closed for a reason that had stopped being
true. **Reading the file beats grepping for a word you expect the author to
have used**, and it is the cheaper half of every session that followed.

### The one thing three separate items agree on

Three times today the obvious port was not the fix, and only a measurement said
so — the golden-hour tint, the camera's swept sphere, and the shadow-cool
grade. **In all three the cast or the fault was in the scene, not in the stage
the plan named.** §6.1's "ablate before re-tinting" is not a style preference;
it is the difference between fixing this and moving a constant.

### Wave 3, audited

- **Motion-blur early-out** — already correct. `PostFX` calls `setMoving` with
  a real matrix-and-mover test; the pass is skipped, not run inert.
- **InstancedMesh culling traps** — no instance of the trap. Grass has per-tile
  bounding spheres and an eviction pool; trees and bushes use per-frame
  repacked global pools, which is a different design and defensible. Not the
  static world-spanning buffer the plan warns about.
- **Chunked-work discipline** — not applicable. We do not yield during boot at
  all, so "a yield that cannot draw" cannot happen. `TODO.md`'s slow page start
  is a different problem and belongs to phase3-boot-and-memory.
- **GenCache generator-hash invalidation** — shipped as `texbake.mts`'s
  `TEX_SOURCES`/`CANVAS_SOURCES` hashing.
- **Draws, not triangles** — already measured: ~8.7 us per draw, corr 0.801 vs
  0.628 for triangles (`project/STATUS.md`).
- **OPEN: the frame-cost split** (pixel-scaled vs fixed). Needs the perf
  re-baseline, and post consolidation is gated on its answer.

### Wave 4, closed — and the line that made the rest of it matter

Cover and fire rhythm is the last piece and it landed in `b29d566`. Four parts,
and a fifth that turned out to be why the other four would have changed nothing.

- **Hit chance as a ladder, not a coin flip.** Incoming ranged fire was
  `if (a.ranged && rng.next() > 0.72) continue` — a flat 28% miss the player
  can neither see nor influence, which makes a firefight a damage race decided
  by stats. Now: `still 0.704 · closing 0.591 · strafing 0.352 · just
  re-acquired 0.387`. Moving beats standing; crossing the shooter's line beats
  closing down it, so charging a shooter is a decision rather than a dodge;
  range costs accuracy against the attack's own reach; and concealment reuses
  `Enemy._concealFactor`, so the grass that hides you from being *seen* is the
  grass that spoils a shot at you, under one law.
- **The head-down window.** `magazine` / `reload` on a `StrikeSpec`; MT at 4
  and 2.9 s, sniper at 3 and 3.4 s. Measured over 30 s of live fight: five
  magazines emptied, longest head-down run **5.25 s** against a 1.6 s burst
  rest. With the aim settle (`telegraph`) and the burst rest (`cooldown`) that
  is MGS5's three exploitable gaps, all present.
- **Misses land somewhere.** A miss used to `continue` while the tracer had
  already been drawn ending exactly on the player, so the only feedback for 28%
  of incoming fire was damage that did not arrive. Misses now scatter with
  range, the tracer terminates where the round went, and one landing near the
  ground raises dust.
- **Cover, scored on the concealment sampler** rather than an obstacle graph
  the enemies do not have and should not grow — what makes a spot good is that
  it hides you from where the shot is coming from, which is the question that
  sampler answers. It runs only while reloading: a shooter that takes cover
  whenever it can never presents a shot, and a fight where nobody is exposed is
  a stalemate, not a rhythm.

**And the fifth.** `fightRange` took the *shortest* attack unconditionally —
correct for a melee creature, which is what its docstring is about, and
catastrophic for anything with a gun. An MT soldier stationed at its
**bayonet's 2.6 m**: counted over 15 s of live fight, **18 bayonet strikes to
2 volleys**. Every firefight in the game was a knife fight and the entire ranged
model, old and new, was running on a tenth of the attacks. A shooter now
stations in its shortest *ranged* band and keeps the melee for when the player
closes into it. Same fight after: **23 volleys to 10 bayonets**.

Nothing found that by looking at the fight. It came out of one line in
`probes/firerhythm.mts` that counts swings *by attack* — the probe asks the
three questions separately (is it wired, does it change an answer, is it
visible) and all three would have passed on a model nobody used.

The other two Wave 4 rows were already done and recorded as untouched: the
`setMotion` rate contract (now measured, `probes/ratecontract.mts`, worst
sign-flip rate 8.3%) and adaptive music re-targeting (`Score.setIntensity`,
driven from enemy proximity and remaining HP; and the wind bed already reads
`Weather.windStrength`, the same value that feeds `veg.setWind` on the same
tick).

### The quiet lane, made shareable

Not a plan item, but it is 2.4's other half and it cost this session an hour
before it was fixed. The exclusive lease is right — one daemon per repo, every
other browser closed, so "the machine is quiet" is enforced rather than hoped
for. What was wrong is that it was first-come-**fail**-rest: a second timing
tool got `exclusive lease already held by bootprof` and a stack trace, and its
only options were to write its own polling loop or to measure anyway on a box
somebody else was using. The second of those is the exact failure 2.4 exists to
close, and the lease was pushing agents toward it. `43531db` gives it a FIFO
queue and `--wait-lease`.

### 3.8(a), built — and what it actually fixed

`world/sky/SkyProbe.ts`. An L2 SH `LightProbe` re-projected from the live sky
dome each time the env cube is re-baked, with the cube demoted to specular-only
through `uEnvDiffuse` so nothing is counted twice, and the inert
`HemisphereLight` resolved in the same change rather than beside it. Shadow
colour is sky colour by construction now, because it is an integral of the sky.

**Two bugs found by building it, both worth more than the feature.**

1. **The ground bounce was cancelled by its own input.** The first version
   scaled the dome's below-horizon texels by a warm ground albedo. `sky.glsl.ts`
   draws under its own horizon as horizon *haze* dimmed to 0.55 — right for a
   view ray, wrong as irradiance, because that light is blue and has been
   through the atmosphere on its way to the *eye* rather than off the ground on
   its way to the *subject*. Warm albedo times blue haze is grey: the down lobe
   measured **R−B +0.9** against an albedo whose own R:B is 1.31. The one warm
   fill in the frame was being erased by the thing it multiplied. Replaced with
   a Lambertian ground lit by the key (`E·albedo/π`); the down lobe is now
   **+79.4** at noon.
2. **Negative irradiance.** An L2 projection of a sky that is bright above and
   near-black below overshoots, and three's `shGetIrradianceAt` does not clamp.
   At 22:00 the down lobe came back at **−0.0017** — downward-facing surfaces
   were having light *subtracted*. Clamped at the probe term. Not de-ringed at
   projection time: windowing the higher bands would smooth away the
   directionality that is the whole point, to fix a defect that only appears on
   the one lobe where the light really is zero.

Neither was visible in a frame. Both came out of `probes/skyprobe.mts`, which
prints probe irradiance at six cardinal normals — built precisely because the
first A/B said the change had barely moved anything and a frame cannot
distinguish "the probe is flat" from "the probe is fine and something
downstream eats it".

**What it fixed, measured.** Every one of seven shots moved past its own noise
floor, up to 5.10 mean/255. `zone_longwythe` **8.83 -> 10.60 stops** with its
black point 6.6 -> 2.0, and `storm` 10.15 -> 10.92 — the unshadowable flood was
lifting blacks, exactly as 3.8 predicted, and removing it is a range win rather
than a colour one.

**What it did NOT fix, and why it never could have.** The handoff said the
daylight grade's last miss was shadow warmth (−9.9 R−B against a +5.8
reference) and that "the rest is the ambient probe". The probe moved it 0.6.
So the gap was ablated outright: with exposure pinned (`?post=noexp`, because
the closed loop otherwise gives back what you remove), deleting the **entire**
diffuse ambient moves shadow R−B from **−4.9 to −2.3**. The whole lever is
worth 2.6 points of a 15-point gap. No ambient, of any colour or strength,
closes it.

`imagestats.mts`'s own docstring says why, and has said so all along: outdoors
the darkest quartile of a frame is mostly *ground*, so `sh(R−B)` is dominated
by terrain and vegetation albedo, not by the colour of the fill. **The row was
filed against the wrong system for two sessions.** It belongs to ground albedo,
and re-filing it there is one of the things that has to happen before this plan
is archived.

One more thing worth not re-deriving: `PROBE_GAIN` is not a brightness knob.
1.0 -> 0.80 moved the daylight slice's mean luma 114.8 -> **115.3** and its
clipping 2.81% -> **2.94%** — both *up*, from turning the probe down, because
closed-loop exposure meters the scene and returns what you took. The
measurement is written next to the constant.

**What 3.8(a) still does not do.** A `LightProbe` is no more occluded by
geometry than the env cube was. Our GTAO is a post pass multiplying the
composited frame, not indirect diffuse in-material, so "nothing shadows it" is
still half true: the probe fixed the *aimability* and the double-count, not the
occlusion. Occluding indirect diffuse specifically needs AO bound in-material,
which is a different change and is not claimed here.

### 3.8(b) PCSS — evaluated, and it is two different answers

**Half of it shipped in a dependency bump.** three 0.185's
`shadowmap_pars_fragment` already implements `SHADOWMAP_TYPE_PCF` as a **Vogel
disc rotated by interleaved gradient noise** — five taps against hardware PCF,
~20 filtered taps, per-pixel rotation. The plan names Vogel disc as something
to port. It is upstream, we are on it, and `Sky.ts` selects `PCFShadowMap`
deliberately.

**The other half is not reachable on this shadow path.** Contact-hardening
needs a blocker *search*: average occluder depth inside a radius, which is a
depth **read**. three binds directional shadow maps as `sampler2DShadow`, which
only compares. Sampling one texture through both a shadow sampler and a plain
`sampler2D` in one program is undefined in GLSL ES 3.0, so the second binding
is not an option, and the alternatives are:

- render a second, linear-depth shadow map per cascade — a full extra shadow
  pass on a renderer whose cascades already cost ~22 ms and dominate the
  failing walk segment, or
- switch to VSM, which `Sky.ts:481` already rejects for an adjacent reason
  (PCFSoft "blurs the cascades to mush").

And there is no room to spend even if there were a way: the page reports
**"Trying to use 16 texture units while this GPU supports only 16"** on every
boot. Three more samplers is not a tuning decision, it is over the ceiling —
the same 16-sampler ceiling §7 already warns about for MGS5's terrain shader.

**Verdict: 3.8(b) is closed.** Not "not evaluated", and not deferred: the
filtering half is shipped and the hardening half needs a shadow-path rewrite
that Wave 3's own cost split would have to justify first.

### 3.6, mostly built — and the file names its own next step

Three of the four items are in the tree and were in the tree when the row said
they were not:

- **tier-D**: `TerrainMaterial.ts:1231`, and there are *two* terms, not one —
  a sward for green zones and a separate dry-cover term for Leide, whose green
  runs 0.05-0.12 and which the sward is therefore off in. Patchy at clump
  scale, band-limited on their own screen footprint so they smooth out instead
  of boiling, and taking the wind from the same uniform objects the blades sway
  on so a gust band crosses the seam. Endpoints measured per zone over the
  pixels the blades actually cover.
- **shadow-only sward proxy**: `GrassField._tileFor`.
- **root-albedo blend**: `GROUND_BLEED = 0.34`, sampling `eco.groundColor` at
  each clump, with the emerald-lawn-vs-olive comparison recorded.

**Coverage economics is the one genuinely open item**, and the tier-D comment
block already says what to do first and it is not about colour: *"Anyone
extending this should widen its reach before touching its colour again."* The
sward is gated on the grass splat weight AND a 100-185 m ramp AND `bioGreen` at
once, and the conjunction is a small fraction of any frame — measured at
**0.037 mean/255 over 0.006% of pixels**, against a floor of 1.5-1.9. It is
recorded in the file as close to a measured negative. Reach, then colour.

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

Re-ticked 2026-08-25 (third opus pass). **6 of 6.**

- [x] Wave 1 items each closed against their RESCUE line item, with captures
      looked at. *(2.6 closed as "present and insufficient", which is a close,
      not a pass — the work moved to `handoff/grounding.md`.)*
- [x] `docs/ART_DIRECTION`-equivalent reference numbers exist in `docs/` and
      the next character-art pass cites them. *(`docs/reference/`.)*
- [x] Blind A/B harness runs with a sealed key; fresh critic pass recorded.
      *(`compare.mts`; ten rounds with a control.)*
- [x] Each Wave 2 lever landed, or rejected with a measured negative.
      **3.1–3.5 and 3.7 landed** in earlier passes. **3.6** is three of four —
      tier-D, the shadow proxy and the root blend were all built and were being
      recorded as open; coverage economics is the one item left and the file
      itself says to widen the term's reach before touching its colour again.
      **3.8(a) is built and measured** (`world/sky/SkyProbe.ts`), including two
      bugs found by building it that were worth more than the feature.
      **3.8(b) is evaluated and closed**: half of it shipped upstream in three
      0.185, and the other half needs three texture units on a page already
      reporting 16 of 16.
- [x] §6 methodology adopted where it is code rather than prose: §6.1 ablation
      is in `BRIEF.md` and now carries `noprobe` as well; §6.2 per-shot noise
      floors are measured and checked in.
- [x] **Perf re-baseline published from the new ruler with noise floor and
      contention verdict attached.** Attempted three times on 2026-08-23 — two
      voided, and the third certified and *failed* at 51 fps on
      `bestiary_necromancer`. Re-run 2026-08-25 on the full corpus:

          VERDICT: quiet — safe to measure.  (load 5.00 / 18 cores, 0 browsers)
          noise floor: start IQR 0.82 ms / end IQR 0.42 ms, bias +0.30 ms
                       16% of the median 5.0 ms frame
          mean 218.1 fps   worst 140 fps (poi_reststop)
          RULER_VALID: true
          PASS: every shot >= 60 fps, on a ruler that validated itself

      `bestiary_necromancer`, the shot that read 51 fps, is at **172**. The
      previous result was the busy machine, exactly as the handoff suspected and
      declined to attribute to that round's work. **This is a baseline, and it
      passes.**

### The one thing this pass did not get, and why

**Wave 3's frame-cost split (pixel-scaled vs fixed) is not measured.** Two
attempts, at 1600x900 and 800x450 on the same six shots; both **VOID**, floor
35–37%, and the half-resolution run put `dun_keycatrich_hall` *up* from 2.00 to
4.35 ms, which is nonsense and is the ruler being right to refuse.

The reason is worth more than the attempt. The floor is measured on `shots[0]`,
so **the order of the arguments decides whether a run certifies**: the full
corpus, led by the quiet `hero_closeup`, certified at 16% on the same machine
minutes earlier. Leading the split with a quiet shot would have produced a
"valid" run, and doing that and then quoting the heavy shots against it is
precisely the self-flattery item 2.4 exists to prevent. So it was not done. The
real fix is a floor per shot — §6.2's lesson applied to `perf.mts` and not only
to `imgdiff.mts` — and it is recorded in `LANDMINES.md` and in
`2026-08-22-opus-phase4`'s WS-0b, which the plan graph already gives the split
to.

### State at exit, 2026-08-25

Working tree clean, `pnpm run check` green across the round, combatloop 31/31,
integration 27 pass / 0 wired-but-unproven, and the perf gate passing on a
self-certified ruler. `project/handoff/sibling-ports.md` is current.

**This plan is DONE and ready to archive.** What is left over is re-filed
below, not forgotten — and unlike the last two passes, none of it is a row that
turns out to have been finished all along, because every row was read this time.

### What this plan does NOT close, and who owns it

| left over | owner |
|---|---|
| 3.6 coverage economics — and widen tier-D's *reach* before its colour | `2026-08-21-fable-procedural-modeling` (owns `src/world/veg/`); the terrain half is `TerrainMaterial.ts:1231` |
| Occluding indirect diffuse. 3.8(a) fixed aimability and the double-count, not occlusion — GTAO is a post multiply, not AO bound in-material | unassigned; needs a lighting lane |
| The daylight grade's shadow-warmth row, **re-filed from the ambient to ground albedo** — the whole diffuse ambient is worth 2.6 of a 15-point gap | whoever next owns terrain/vegetation albedo |
| Wave 3's frame-cost split, and post consolidation behind it | `2026-08-22-opus-phase4` (WS-0b perf) |
| A noise floor per shot in `perf.mts`, so a run's validity stops depending on argument order | `2026-08-22-opus-phase4` (WS-0b), with the split |
| 2.6 grounding | `project/handoff/grounding.md` |
