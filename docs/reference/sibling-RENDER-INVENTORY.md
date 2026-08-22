# Renderer inventory — what is actually in a frame

Derived by reading `src/render/**`, `src/world/**`, `src/actors/body/**` and
`src/combat/Vfx.ts` on the round-4 tree. **Purpose: kill absence claims before
they cost a round.** Judges have reported absent features that were provably
present at least three times in this run. Check here first.

Three.js 0.181.2. One HDR half-float scene target → reduced-res passes → ONE
full-res composite doing aerial perspective + DOF + AO + motion blur + bloom +
godrays + tonemap + grade + sRGB encode in a single draw → SMAA.

## PRESENT — do not file these as missing

| Feature | Technique | Key values |
|---|---|---|
| Tonemap | ACES filmic (Narkowicz fit), hand-rolled | `Post.ts:297`; `NoToneMapping` on the renderer so three can't double-apply |
| Exposure | **dynamic**, sky-driven | 1.16 midday → 2.55 night (`SkyState.ts:188`) |
| Colour grade | sat + S-curve contrast + lift + split-tone + toe chroma crush + vignette | see trap 2 — live values are in `RenderStack.tuneGrade()`, NOT `Post.ts` |
| Bloom | Karis-averaged soft-knee prefilter, 13-tap down, tent up, 6 mips | threshold 1.05, knee 0.35, strength 0.62 (+0.22 at night) |
| SSAO | hemisphere kernel, 10 samples, half-res, box-blurred | radius 0.9, bias 0.035, strength 0.60. Normals reconstructed from depth |
| DOF | 9-tap ring, half-res, **far-field only** | focus 90, range 520, strength 0.30 |
| Motion blur | reprojection, 6 samples, **camera-only** | scale 0.42; static camera ⇒ zero velocity by design |
| Anti-aliasing | **SMAA**, after the sRGB encode | MSAA deliberately off (trap 1) |
| Shadows | **CSM**, PCFSoft, 2–4 cascades, 1024–2560 map | bias -0.0006, normalBias 0.35, blurSamples 8, maxFar 320 |
| Lighting | CSM sun/moon + hemisphere fill + exactly 2 point practicals | sun 5.4, moon 0.48, hemi ~0.40–0.44 |
| IBL | PMREM probe over the live sky, size 64, refreshed ≤1.5 s | `environmentIntensity` 0.16 day → 0.55 night |
| Fog / aerial persp. | post-process analytic exponential **height fog**, per-pixel directional inscatter | density 0.0014, scale height 150, aerialMax 0.82, hazeDesat 0.82. `scene.fog` is null on purpose |
| God rays | radial screen-space scatter, quarter-res | density 0.85, decay 0.955, strength 0.52. Off when sun off-screen (trap 12) |
| Sky | fully procedural Preetham+HG analytic, sun disc, moon, stars, galactic band, 2-fbm clouds | 900 s per in-game day |
| Water | **real planar reflection** (2nd scene render, oblique clip) + analytic depth refraction + 3-octave scrolling ripple normals | reflection at 0.38–0.62× buffer; off on `low` |
| Character maps | albedo + normal on every zone; roughness on leather/metal/fur/horn/blade | procedurally baked (see WEAK below) |
| Subsurface | wrapped diffuse + warm indirect fill, injected by INLINING `lights_physical_pars_fragment` in place of its `#include` | **LIVE as of round 5** — was dead for 4 rounds. Behind `#ifdef FFXV_SSS`; asserts its own marker and counts injections; `window.__SHADER_AUDIT__()` reports them. Skin lit:shadow 4.17x -> 2.84x, R>G>B on 100% of skin px. Fur gets the wrap but `ambGain = 1` so the creature/sky Weber band is preserved (re-verified 27.5-68.1%) |
| Cloth | `MeshPhysicalMaterial` with sheen | sheen 0.5, roughness 0.7 |
| Grass | 4 instanced tiers, curved 3-segment blades near, 60k cap/mesh | 26–76 m radius by tier; wind + backlit translucency |
| Foliage | 2-tier LOD (geometry → impostor); 6400 conifers, 2400 broadleaf, 11000 bushes | conifer needles are a normal-mapped closed cone, no alpha test |
| Terrain | 3 LOD tiers + 2 horizon rings; 5-layer procedural splat, triplanar rock | |
| VFX | 4 pooled draw calls, 7 particle kinds, premultiplied-alpha blend giving additive AND alpha in one pass | emissive cores are linear >1.0 to deliberately cross the bloom threshold |
| Rain, lightning | instanced camera-wrapped streaks; deterministic flash driving exposure/ambient/haze | up to 3200 drops |
| Ground scorch | 7-layer world-aligned decal stack through the emit plane | |

**Every texture in this game is procedural. Zero image assets are loaded.**

## ABSENT — genuinely not implemented

- **Screen-space reflections.** No SSR pass anywhere. Reflections come only from
  the PMREM sky probe and the water's planar reflection.
- **Baked/authored AO on characters** — no `aoMap` in the project at all. Character
  AO is screen-space only.
- **Soft-particle depth fade.** `scene.userData.depthTexture` is published twice and
  has no reader; sampling it from an in-scene material would form a feedback loop.
- **Near-field DOF / bokeh.** Far-field only.
- **Per-object motion blur.**
- **TAA, FXAA, MSAA.** SMAA only.
- **Colour LUT.** No 3D texture anywhere.
- **`emissiveMap`, `lightMap`, clearcoat, transmission, iridescence.**
- **Eye materials carry no maps at all.**
- **Grass and terrain cast no shadows** (deliberate budget choice).

## WEAK — present but likely under-spec for a AAA closeup

- **Character albedo/normal maps are 128² procedural `DataTexture`s**, six families,
  used as *detail multipliers* with the mean divided back out. At a closeup framing
  this is the most likely reason characters lose a blind A/B.
- `csm.fade = false` — visible cascade seams are possible.
- PMREM probe is **size 64**.
- SSAO is **10 samples at half res** with depth-reconstructed normals.

## TRAPS — read before quoting any number

1. **MSAA is coded and forced off** (`Post.ts:640`, `wantSamples = 0`): the depth
   attachment did not survive the multisample resolve and silently killed fog,
   SSAO, godrays and DOF. AA is not absent — it is SMAA.
2. **The grade constants in `Post.ts:565-573` are DEAD.** Every one is overwritten
   by `RenderStack.tuneGrade()` before the first frame. Quoting them as the shipped
   grade is the single most likely mis-read in this codebase. This exact mistake
   cost round 3 an item.
3. `uStars` is a live-written but dead uniform in the composite — `inscatterColor()`
   hard-zeroes star amount. Stars are real in the sky dome, absent in the fog path.
4. **DOF early-outs** at `uDofStrength <= 0.02`, and `tBlur` then silently aliases
   the scene texture.
5. **God rays early-out** whenever the sun is off-screen or below 0.05 intensity. A
   night frame showing no shafts is by design.
6. **Motion blur reads as absent on any static-camera shot**, by design.
7. `low` tier disables SSAO, volumetrics, motion blur, DOF and water reflection.
   Default tier is `high`. Never judge a `low` capture.
8. **SMAA is skipped until its base64 LUTs decode**; `warm()` forces it at boot so
   captures don't catch an un-antialiased frame.
9. `Practicals` is hard-sized to **2** point lights (a program cache key); the
   comment claiming three is stale, and its tail loop is unreachable.
10. `makeStreakTexture()` is dead code — rain uses an analytic shader streak.
11. `scene.fog = null`, so Water's fog includes compile to nothing. Water is still
    hazed, by the composite's aerial perspective.
12. **`Post.render()` REWRITES `uBloomStrength`, `uFogDensity`, `uExposure` and
    `uMieG` every single frame.** Setting them from a probe is a silent no-op, which
    invalidates any probe-based ablation. Same class as trap 2 and it cost builder A
    a whole first attempt. To ablate, add a neutral-valued dial in the shader rather
    than writing an existing uniform.
13. **The first render after a camera move carries a full-screen motion-blur smear.**
    Discard it before measuring anything.
14. **`shots/playtests/*.png` can be REWRITTEN AT A DIFFERENT RESOLUTION mid-session.**
    Two agents' runs wrote 1920x1080 and then 2880x1620 to the SAME filenames in one
    round. Any measurement quoted in pixel COORDINATES from that directory must check
    `im.size` first; fractions and percentages are safe. This silently invalidated a
    cross-agent comparison in round 4 and was caught in round 5.
15. `Rig.ts:312` — a body stops casting shadows during a death/warp fade below 0.35.
