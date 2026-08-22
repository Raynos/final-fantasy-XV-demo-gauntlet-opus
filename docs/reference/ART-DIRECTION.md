# Final Fantasy XV — Art Direction Brief

> **Canon, and the only quantified art target this project has.** Ported verbatim
> from `docs/ART_DIRECTION.md` in the sibling repo `final-fantasy-XV-demo-opus`,
> which spent 133 commits turning art direction into pixel-sampled numbers. The
> 53 plates it cites are checked in beside it under `plates/`, so every hex value
> below is re-derivable — `node src/tools/imagestats.mts "docs/reference/plates/*.jpg"`
> prints the frame statistics for the whole corpus.
>
> `BRIEF.md` states the direction in prose. **This file states it in numbers, and
> where the two ever disagree the numbers win.** Ported under
> `docs/plans/2026-08-21-fable-sibling-ports.md` §3.1.

Derived by direct visual inspection (and, where noted, pixel-level sampling
with PIL) of the 53 reference screenshots in `docs/reference/plates/` — §1–11 from the
original 17, §12–13 from the 36 added in the round-2 expansion — see
`docs/reference/PLATE-SOURCES.md` for provenance. Where a colour is quoted as a hex/RGB value,
it was sampled from a named file at approximate image-space coordinates, not
estimated by eye; treat these as ballpark real data points from compressed
JPEG/WebP source images (±10-15 levels per channel from re-encoding), not lab
measurements. This is the working art bible — build the renderer's grade,
fog, foliage and HUD against these numbers, then refine by comparison against
the corpus in `docs/reference/plates/`.

## 1. Colour grade / tonemapking character

FFXV is **not** a saturated, punchy grade. Sampling flat mid-tones
consistently comes back desaturated:

- Sunlit grass (`duscae-plains-lake-01.jpg`, sunny midday): `#6f753b` — an
  olive/khaki green, not a vibrant green. Chroma is low relative to a naive
  "grass = green" assumption.
- Sky zenith on the same frame: `#4b94be`; sky near horizon: `#78b6dc`. The
  horizon value is both lighter *and* less saturated than the zenith — early
  evidence of aerial perspective washing the grade toward pale blue-white
  near the ground plane (see §2).

**Shadows lean cool, highlights lean warm — but check the direction against
light source, not against "shadow = always cool":**

- Near-black car paint in shadow (`duscae-plains-lake-01.jpg`, the Regalia's
  black bodywork): open shade side `#231f1e` (R35,G31,B30 — barely-warm, R
  slightly hottest channel even in near-black) vs. sky-bounce side
  `#2f3837` (R47,G56,B55 — G/B now *higher* than R, i.e. cool). Both are deep
  lifted blacks (nowhere near RGB 0,0,0), consistent with a filmic tone curve
  that never crushes to pure black.
- Grass in cast shadow under a tree (`duscae-plains-lake-01.jpg`): `#4e5947`
  — green-grey with G and B both above R, a cool cast.
- Interior seat shadow in the golden-hour convertible shot
  (`golden-hour-godrays-01.jpg`): `#1d241a` — again G > R, cool, *even though
  the scene's key light is a warm setting sun*. This is the tell: FFXV grades
  shadow regions toward teal/green-cyan **independent of the actual light
  colour**, and pushes sunlit/highlight regions warm — a deliberate
  teal-shadow/orange-highlight split layered on top of the physical lighting,
  not a byproduct of it.

**Blacks are lifted, contrast is filmic (soft shoulder, no hard clipping)**:
even the darkest sampled pixel in this corpus (`#010409` inside the unfilled
MP bar background of the HUD, which is meant to read as "black") is not
literal 0,0,0. Rendering should target a filmic tonemap (ACES-like or a
custom Reinhard/Hable variant) with a raised black floor (~3-5% luma) rather
than a raw linear-to-sRGB clip.

Overall grade recipe: desaturate the base image ~10-20% from a naive
physically-lit render, split-tone shadows toward hue ~160-200° (cyan/teal)
and highlights toward hue ~30-45° (orange/amber), lift black point, and keep
a soft filmic highlight rolloff (the sun disc and its halo blow out to flat
`#fdfdfd`/`#ffffff` with no visible chromatic fringing in
`golden-hour-godrays-01.jpg` and `duscae-plains-chocobo-02.jpg`).

## 2. Atmospheric / aerial perspective

Distant elements desaturate and lighten toward the sky colour rapidly.
Sampled distant mountain haze in `duscae-plains-lake-01.jpg`: `#bad2e4` — a
pale, low-chroma blue-white, versus the foreground grass olive `#6f753b`.
That's roughly a 3-4x jump in perceived lightness and a near-total loss of
hue distinction within a few kilometres of simulated distance. Practical
falloff curve: treat aerial-perspective fog density as roughly exponential
with distance, reaching ~70-80% blend-to-sky-colour by the time a mountain
ridge is at the horizon (a few km away in-fiction), with mid-ground tree
lines (a few hundred metres, as in the same frame) still reading with only
mild desaturation. Haze density should also increase near the ground plane
in golden-hour shots (`golden-hour-water-02.jpg` shows a soft glowing horizon
band above the sea where the volcanic haze and low sun scatter together).

## 3. Sun / sky model and typical sun elevation

Two clearly distinct lighting regimes appear across the corpus:

- **Midday** (`duscae-plains-lake-01.jpg`, `town-daytime-altissia-01.jpg`,
  `water-lake-01.jpg`): high, small, hard-edged sun; sky is a clean gradient
  from saturated blue at zenith to pale blue-white at horizon; shadows are
  short and high-contrast; cumulus clouds with soft, slightly overexposed
  edges.
- **Golden hour** (`golden-hour-godrays-01.jpg`, `golden-hour-water-02.jpg`,
  `duscae-plains-chocobo-02.jpg`): sun sits low, roughly 5-15° above the
  horizon judged by shadow length and the amount of frame the glow
  occupies; sun disc and immediate halo blow out to flat white/near-white
  (`#fdfdfd`), surrounded by a broad soft-edged bloom bleed that overlaps
  30-40% of frame width in `golden-hour-godrays-01.jpg`; sky shifts to
  peach/pink near the sun (`golden-hour-water-02.jpg` sky reads warm
  pink-gold near the horizon, cooling to blue overhead — a vertical gradient,
  not a flat tint).

There is no visible sun at high noon with hard vertical light in any shot
(no top-down "flat" lighting) — even the midday shots read as mid-morning to
mid-afternoon sun angle (~35-55° elevation), never zenith-straight-down. Build
the day-night cycle's "noon" state around a ~45° sun elevation, not 90°, to
match FFXV's marketing/gameplay screenshots.

## 4. Bloom

Bloom is used generously but is confined to true overexposed highlights, not
smeared across all light values:

- Sun discs and their immediate halos clip to flat white with a wide, soft
  bloom skirt (`golden-hour-godrays-01.jpg`, `duscae-plains-chocobo-02.jpg`
  where the sky sampled directly next to the sun is pure `#ffffff`).
- Magic/summon VFX (lightning in `combat-technique-hud-03.jpg`'s source
  material and the lightning-caster close-up) blooms strongly — thin bright
  lines gain a soft halo 2-4x their core width.
  Warp-strike trails and weapon-clash sparks likewise bloom hard against dark
  backgrounds (`rain-combat-closeup-02.jpg`).
- Non-emissive, merely "bright" surfaces (sunlit skin, white shirt fabric)
  do **not** visibly bloom — the effect is reserved for genuinely
  high-luminance/emissive sources. Recommended: bloom threshold around
  1.0-1.2x reference white (i.e., only pixels that would clip in a
  non-tonemapped render), radius large enough to visibly soften a sun disc
  across ~5-8% of frame width, but leave diffuse-lit materials bloom-free.

## 5. Depth of field

DOF is subtle and scene-dependent, not a constant blur:

- Wide environment/vehicle shots (`duscae-plains-lake-01.jpg`,
  `party-roadtrip-galdin-01.jpg`, `town-daytime-altissia-01.jpg`) are
  essentially deep-focus — background mountains and buildings stay legibly
  sharp. This matches an open-world exploration camera that keeps gameplay
  space readable.
  Combat HUD shots (`hud-combat-full-01.jpg`, `combat-warpstrike-hud-02.jpg`)
  are similarly deep-focus — DOF is not used to soften gameplay-critical
  enemy/ally silhouettes.
- Directed cutscene-style close-ups (the boss-facing composition in
  `behemoth-boss-01.jpg`, and character close-ups) show soft falloff on
  background architecture within a few metres, consistent with a shallower
  cutscene-camera DOF (roughly f/2.8-f/4 equivalent) layered on top of the
  otherwise deep-focus gameplay camera.

Recommendation: keep DOF off (or near-imperceptible, background CoC < 1px at
1080p) during free exploration and HUD-on combat; enable a mild
foreground-anchored DOF (background blur only, no near-field blur) for
scripted/cutscene camera cuts.

## 6. Motion blur

Present but restrained. `combat-warpstrike-plains-01.jpg` (Noctis mid
warp-strike, airborne) shows directional streak-blur on the shattering
weapon-VFX shards, not on Noctis's body itself, which stays crisp — motion
blur here is baked into the particle/VFX trail rendering rather than a
full-screen per-pixel motion-vector blur. Vehicle shots
(`party-roadtrip-galdin-01.jpg`, `golden-hour-godrays-01.jpg`) show static-sharp
wheels/background with no motion trails, implying the driving camera does not
apply camera-shake motion blur even at speed. Recommendation: implement
motion blur as an object/VFX-level trail effect (warp-strike, weapon swings,
summon entrances) rather than a global per-pixel screen-space motion blur
pass, to match the corpus.

## 7. Grass / foliage: density, wind, LOD

Cropped close-up of ground cover in `combat-warpstrike-hud-02.jpg`
(`crop_crosschain_cmdlist` region, foreground grass ~2-5m from camera) shows:

- Grass rendered as a blended base terrain texture (a mottled
  green/olive/brown ground material) **plus** discrete grass-blade card
  clusters planted on top, each cluster roughly a hand-width across in
  screen space at that distance — not a uniform "shag carpet" of individual
  blades. Density is moderate: clusters are spaced with visible gaps of bare
  terrain texture between them, not fully overlapping.
- Bushes/shrubs (same crop) are built from a small number of rounded
  leaf-clump "cards" or clustered geometry (roughly 4-8 visible lobes per
  bush), not from fine individual-leaf geometry — a classic billboard/card
  clump LOD look even at fairly close range.
- `duscae-plains-chocobo-02.jpg` shows tall grass backlit by a low sun with
  strong rim-light on individual blade silhouettes near camera (within ~3m),
  confirming blade-level card geometry (not just a texture) is used for the
  nearest LOD ring, with translucent/SSS-style backlighting on the cards.
- No hard LOD pop was directly visible in any single frame (these are all
  posed/marketing captures at one camera distance), but the visible
  transition from "distinct blade cards near camera" (chocobo shot) to
  "blended clumped texture" (mid-distance in the lake/plains shot) implies at
  least a two-tier LOD: near = card geometry with alpha + backlight, far =
  baked/blended ground texture with no geometry. Recommendation: implement at
  minimum a 2-band grass LOD (card mesh within ~5-8m of camera, texture-only
  beyond), with per-blade wind sway limited to the near band and a slower,
  larger-wavelength "field ripple" wind pass on the texture-only far band.
- Wind: no two frames show static/dead grass — every grass surface in the
  corpus shows some bend/tousle, implying a constant ambient wind sway rather
  than a purely idle/no-wind default state.

## 8. Terrain material layering

Visible in `duscae-plains-lake-01.jpg` and `combat-warpstrike-plains-01.jpg`:
a base dirt/rock layer (warm grey-brown, visible on the exposed path and
rock outcrops) blended with a grass layer (olive-green, per §7) that thins
out near rock edges and path shoulders — the blend is a soft gradient a
half-metre or so wide, not a hard mask cutoff. Rocks themselves are a flatter
grey (`duscae-plains-lake-01.jpg` foreground boulders) with minimal
sub-surface variation, low specularity (they read matte, not wet/glossy).
Lakeshore mud/wet-sand transition is visible as a darker, slightly desaturated
band directly at the waterline in the same frame — a distinct "wet terrain"
material rather than the dry-terrain texture simply darkened.

## 9. Character shading

- **Skin**: `crop`-sampled from a magic/lightning-lit close-up
  (`skin-lit-cheek` in a purple-lit scene) reads `#efddeb` in direct light —
  very light with a warm-pink undertone bleeding through even under a
  cool/purple key light, characteristic of subsurface-scattering skin
  shading (light "leaks" a warm tone regardless of key colour). Shadowed skin
  on the same face sampled `#483843` — notably darker but keeping a
  magenta/warm hue rather than going flat grey, again consistent with SSS.
  Caveat: that sample is scene-tinted by purple spell VFX, not neutral
  daylight — treat the *warm-bleed-through-cool-shadow* behaviour as the
  transferable fact, not the literal hex values.
- **Hair**: rendered with visible anisotropic highlight strands (a
  bright, tight specular streak following strand direction) distinct from
  the diffuse hair-shadow value — sampled highlight `#17345c` vs. shadow
  `#73667e` in the same lightning-lit shot (again scene-tinted blue/purple,
  but the *specular streak vs. flatter diffuse base* structure is the
  transferable detail). Individual strand silhouettes are visible at the
  hair edge/rim in most close-ups (`combat-technique-hud-03.jpg`'s Noctis
  close hair rim, the lightning-caster shot) — implies strand-based
  anisotropic hair shading with visible flyaways, not a solid capsule/cap.
- **Cloth**: Noctis's jacket and party members' jackets read as matte
  leather/synthetic with soft, broad specular falloff (no sharp mirror
  highlight) — sampled lit vs. shadow jacket fabric in the lightning shot:
  `#1f4a61` lit vs `#041a2a` shadow, a large luminance swing with hue held
  roughly constant, consistent with a rough (high-roughness) PBR material
  rather than cloth micro-fiber shading.
- **Metal / armour**: Imperial MA soldier armour
  (`combat-technique-hud-03.jpg`, `combat-warpstrike-hud-02.jpg`) shows tight,
  bright, small specular highlights on curved plate edges against a much
  darker matte base — classic metallic PBR (low roughness, high metalness)
  distinct from the cloth/leather treatment above. Weapon blades
  (warp-strike dagger icon, engine blade) show a cool blue-white specular
  streak along the edge, reinforcing a clean high-metalness look for
  weapons specifically (slightly cooler/bluer specular tint than armour).

## 10. HUD layout (sampled from `hud-combat-full-01.jpg`, 1844×1036, and
`combat-warpstrike-hud-02.jpg` / `combat-technique-hud-03.jpg`, 1920×1080)

All positions given as **% of screen width/height** so they scale to any
render target; colours are sampled hex values from the named source file.

| Element | Position | Notes / sampled colour |
|---|---|---|
| Minimap | Circular, top-right corner. Center ≈ (91-93% w, 10-15% h), diameter ≈ **20.7%** of screen height (CORRECTED round 4: re-measured on the cited plate `hud-combat-full-01.jpg` as 214 px of 1036. The previous "13-15%" figure was wrong by ~2x and would have shipped a half-size minimap). | Ring reads as a worn brass/olive tone in this frame — sampled ring `#4a4228`, background disc `#6e6b5e` (semi-transparent, terrain-tinted; treat as a dark frame + terrain-colour fill, not a fixed colour). |
| Day-counter / fast-travel icon | Just left of/above minimap, small chocobo or car glyph with a countdown number ("6 days left"). | White text, small yellow/gold icon. |
| Quest / enemy-group banner | Below minimap, right-aligned, 2 lines: quest name (gold `#d4af37`-family) + enemy checklist "Name  n/n" (white). | Right-aligned text block, ~55-75% h, 70-95% w. |
| Warp/Phase gauge (boss & technique sequences) | Horizontal bar, top-left. Bar spans ≈ 2-22% w at ≈ 61% h; "MAX" label in green caps at the bar's right end. | Filled bar sampled `#67a464` (mid-green); a second thinner two-tone bar directly below splits into a left "Phase" zone and right "Attack" zone (dark navy translucent panel, separated by a white/orange 4-dot cross icon). |
| L1/R1 (or L2/R2) button prompts | Small rounded-rect button glyphs immediately left of the gauge/"Lock on" text, ≈ 0-5% w. | White glyph on dark outline, orange downward accent tick above each. |
| Weapon wheel | Circular dial, bottom-left. Center ≈ (12% w, 75% h), outer ring diameter ≈ **20.3%** of screen height (CORRECTED round 4: re-measured on the cited plate `hud-combat-full-01.jpg` as 210 px of 1036. The previous "10-11%" figure was wrong by ~2x). | Ring colour is a glowing periwinkle/cornflower blue, brighter at the top (bloom) than the sides — sampled `#8e99e8` (top, brightest) to `#5e67bc`/`#6f7fe6` (sides). Center disc shows the currently-equipped weapon icon on a dark navy translucent fill; three other equipped-weapon icons sit at the 8-, 4-, and 6-o'clock positions around the ring; a small D-pad "+" glyph sits dead-center as the input hint. |
| Equipped-weapon name label | Below the weapon wheel, ≈ 78-85% h. | White text with a small weapon-type icon, e.g. "Engine Blade III". |
| Command / technique list (context-sensitive, e.g. during tutorials or EX techniques) | Right-aligned text stack, ≈ 83-98% w, 42-62% h. | White caps-style labels (Tactical, Sprint, Lock on, Roll-dodge, Warp-strike, Jump) each paired with a small button-glyph icon; roll-dodge/warp-strike/jump use an orange multi-dot cluster icon (right-stick direction hint) rather than a single button glyph. |
| Enemy name + level + HP bar | Top-center-ish, floats above the locked-on enemy in world space (position varies with enemy screen position, not fixed screen-space). | "Level NN" in orange/red (`level number`), enemy name in white beneath, thin horizontal HP bar underneath — bar colour varies by context, sampled as a pale lavender/purple `#928ebc` on a large armoured enemy (may indicate a "staggered"/"vulnerable" tint rather than the default; default enemy bars elsewhere read closer to a warm amber/orange). |
| Damage numbers | Float at point of impact, screen-space, large bold white numerals with dark drop-shadow (e.g. "3374", "576"); special-move name in smaller bold blue/white caps just below the number (e.g. "WARP-STRIKE", "Damage x 2.3" / "Blindside", "Damage x 1.5"). | White numerals, blue-white tinted technique-name text. |
| Party HP/MP panel | Bottom-right, four stacked rounded-rect rows. Panel spans ≈ 80-98% w; top of stack ≈ 78% h, bottom row flush to ≈ 100% h (screen bottom edge). | Each row: dark navy translucent background (`#1a1b2f`), character name white top-left, HP integer white top-right, thin horizontal bar beneath — filled portion bright white (`#fefefe`), unfilled portion mid-grey (`#99979b`). Bottom row (Noctis, the player character) is taller and adds a second, thinner MP bar below the HP bar: filled portion is a cyan-to-violet gradient (`#b0e3f9` cyan end → `#8f87ea` violet end), unfilled portion near-black (`#010409`). |
| Hit counter | Left side, mid-height (≈ 40-45% h) during combo strings, large italic white numeral + "HITS" label, e.g. "19 HITS". | White, large, no background panel — floats directly over gameplay. |
| "Joined Party" / status banner | Top-left, ≈ 0-25% w, 0-12% h, appears transiently. | Dark translucent bar, white text, small chevron accent. |

## 11. Camera: FOV, height, shoulder offset

Judged from the over-the-shoulder combat frames
(`combat-warpstrike-hud-02.jpg`, `combat-technique-hud-03.jpg`,
`combat-warpstrike-plains-01.jpg`):

- **Follow distance / framing**: Noctis's model typically occupies roughly
  15-25% of frame height in active combat (mid-shot, not close-up), implying
  a follow camera a few metres behind the character — consistent with a
  third-person action-RPG "over shoulder, pulled back" rig rather than a
  tight over-the-shoulder shooter camera.
- **Shoulder offset**: the camera is offset to look past the player
  character's right side in the sampled combat frames (character
  left-of-center or center-left in frame, open space to the right where
  targets/HUD reticle sit) — a standard right-shoulder action-camera bias.
- **Height**: camera sits roughly at chest-to-head height of the player
  character in normal combat (eye-line close to the top third of frame),
  tilting up sharply for large enemies (the "Titan-scale" boss framing in the
  sourced Cross-Chain material looks steeply upward, indicating the camera
  will pitch to keep a big enemy's silhouette in frame rather than keeping a
  fixed horizon).
- **FOV**: wide enough to keep 2-4 enemies plus the full HUD legible
  simultaneously in open-field fights (`combat-warpstrike-plains-01.jpg`
  shows Noctis, a downed enemy, three standing imperial soldiers, and a
  flying enemy all in one frame with room to spare) — estimate a fairly wide
  ~55-65° vertical FOV (≈ 80-95° horizontal at 16:9) for the default combat
  camera, widening further during warp-strike/lock-on transitions which pull
  the camera back and up.
- Exploration/vehicle-cam shots (`party-roadtrip-galdin-01.jpg`,
  `golden-hour-godrays-01.jpg`) sit low and close over the car's rear/side,
  roughly bumper-to-shoulder height of the seated passengers, again a wide
  FOV that keeps the full car body and a generous slice of environment in
  frame.

## 12. CHARACTER rendering (measured from the round-2 character plates)

Everything in this section was sampled with PIL from the files named, at the
image-space regions given. Regions are quoted as fractions of image width and
height with the pixel box in brackets. Where a *distribution* is quoted (p10 /
p50 / p90), the value is the median colour of the 120 pixels nearest that
luminance percentile inside the region, computed after downsampling the region
to 520 px wide — this is deliberately robust against JPEG blocking and against
a single stray pixel, and is a much better description of a material than any
one-pixel eyedropper. Skin regions were additionally filtered by a
skin-chromaticity test (`R > G > B`, `R − B > 18`, `R > 55`) so that hair,
cloth and background inside the face box do not pollute the statistic.

### 12.1 Skin: the lit-to-shadow ratio is only 2–3x, and shadows stay warm

| Plate | Lighting | Face region sampled | Deep shadow (p10) | Shadow (p35) | Lit (p65) | Bright lit (p90) |
|---|---|---|---|---|---|---|
| `character-noctis-face-01.jpg` | soft cool ambient, no hard key | x 0.456–0.628, y 0.230–0.549 (px 875–1206, 248–593) | `#56423a` | `#6c5646` | `#967764` | `#ab8777` |
| `character-noctis-mastershot-04.jpg` | neutral studio | x 0.083–0.326, y 0.325–0.708 (px 121–475, 245–534) | `#4d3a33` | `#70544c` | `#91746a` | `#c09d91` |
| `character-prompto-daylight-01.jpg` | full midday sun | x 0.300–0.380, y 0.280–0.419 (px 576–730, 302–453) | `#44372b` | `#64453a` | `#80694a` | `#a58d66` |
| `character-gladiolus-face-01.jpg` | warm low evening key | x 0.440–0.579, y 0.200–0.499 (px 845–1112, 216–539) | `#592608` | `#763f19` | `#9a5024` | `#f57e33` |
| `character-ignis-face-01.jpg` | single hard warm key, black surround | x 0.447–0.599, y 0.219–0.499 (px 719–963, 197–448) | `#6a2002` | `#883b07` | `#d46427` | `#f57f3e` |

Three things fall straight out of that table:

- **The lit:shadow luminance ratio on skin is 2.0–3.2x, never more.** Noctis
  in ambient light: p90 `#ab8777` (Y≈142) over p10 `#56423a` (Y≈69) = **2.04x**.
  Studio: `#c09d91` (Y≈164) over `#4d3a33` (Y≈62) = **2.66x**. Full midday sun:
  `#a58d66` (Y≈143) over `#44372b` (Y≈57) = **2.52x**. Even the two hard-key
  shots only reach **3.2x**. A physically-lit render with a strong directional
  sun and a weak ambient term will land at 8–15x and read instantly wrong —
  faces will look sooty and contrasty. FFXV is running a very strong
  hemispherical/ambient fill term relative to its key.
- **Skin shadow does NOT follow the scene's teal-shadow grade from §1.** In
  every plate, including the ones with an explicitly *cool* key light, the
  shadowed skin keeps `R > G > B`: `#6c5646` (107,86,70), `#70544c` (112,84,76),
  `#64453a` (100,69,58). Environment shadows in this game push cyan; skin
  shadows do not. This is the signature of subsurface scattering doing the work
  — the shadow terminator is where the red bleed-through is strongest, so the
  shadow gets *more* chromatically warm, not less, exactly cancelling the grade.
  If our renderer applies a global shadow-tint LUT it will kill this and the
  faces will read as plastic.
- **Saturation drops only slightly into shadow.** Noctis lit `#967764` has
  R−B = 50; shadow `#6c5646` has R−B = 37. That is a 26% chroma reduction over
  a 2x luminance drop — i.e. skin does not desaturate toward grey in shade.

### 12.2 How much of a face is in shadow at typical framing

Taking each face's skin pixels and thresholding at 45% of the p10→p90
luminance span:

| Plate | Skin pixels below threshold |
|---|---|
| `character-noctis-face-01.jpg` | 45% |
| `character-ignis-face-01.jpg` | 48% |
| `character-noctis-mastershot-04.jpg` | 51% |
| `character-prompto-daylight-01.jpg` | 56% |
| `character-gladiolus-face-01.jpg` | 63% |

**Roughly half the visible face is in the lower half of its lit range, in every
single plate, in every lighting condition.** FFXV never frames a flat, evenly
front-lit face. The key is consistently off-axis enough to put one cheek, the
eye sockets, and the underside of the jaw into the shadow band, and the fill
then lifts that band to within 2–3x of the lit side (§12.1) so it stays
readable. A character light rig that keys down the camera axis will produce a
face that is 10–15% shadow and will not match, no matter how good the shader is.

### 12.3 Hair: near-black diffuse, cool-tinted, with a narrow bright streak

| Plate | Hair region | p10 | p50 | p90 | p99 | Y p5 → p99.5 |
|---|---|---|---|---|---|---|
| `character-noctis-face-01.jpg` (black, cool ambient) | x 0.42–0.66, y 0.05–0.24 (px 806–1267, 54–259) | `#101922` | `#1f2630` | `#545859` | `#838786` | 20 → 140 |
| `character-noctis-mastershot-04.jpg` (black, studio) | x 0.05–0.26, y 0.13–0.32 (px 73–378, 98–241) | `#0b0f17` | `#262d38` | *(backdrop leak)* | *(backdrop leak)* | 9 → 131 |
| `character-prompto-daylight-01.jpg` (blond, full sun) | x 0.30–0.40, y 0.18–0.29 (px 576–768, 194–313) | `#0f1d25` | `#4a5453` | `#968567` | `#bba884` | 22 → 176 |
| `character-gladiolus-face-01.jpg` (brown, warm key) | x 0.45–0.58, y 0.08–0.22 (px 864–1113, 86–237) | `#0e0505` | `#140907` | `#2c1005` | `#471f09` | 6 → 43 |
| `character-ignis-face-01.jpg` (ash, hard warm key) | x 0.44–0.60, y 0.05–0.21 (px 707–964, 45–188) | `#1a0703` | `#642402` | `#853e07` | `#8d470c` | 7 → 84 |

- **Hair is rendered far darker than intuition.** Noctis's black hair medians at
  `#1f2630`, Y≈37/255. Even *blond* hair in **full midday sun** medians at
  `#4a5453`, Y≈81/255 — barely a third of the way up the range. If our hair
  material medians above ~Y 100 in daylight it is too bright.
- **Hair diffuse is cool-tinted, and this is the opposite of skin.** Noctis's
  hair at p10/p50 reads `#101922` (16,25,34) and `#1f2630` (31,38,48) —
  `B > G > R` in both, a blue-black rather than a neutral black. Prompto's
  *blond* roots at p10 are `#0f1d25` (15,29,37), also blue. Where §12.1 shows
  skin resisting the cool grade, hair leans into it hard. Two different shadow
  hues on the same head at the same time is the thing to reproduce.
- **The anisotropic streak is narrow and desaturating.** Noctis's hair spans
  Y 20 at p5 to Y 140 at p99.5 — a **7x** range within one head — but the
  bright end is only reached by a few percent of the pixels, and it arrives as
  `#838786` (131,135,134): a *neutral* grey, with the blue tint completely
  washed out. The specular is high-intensity, low-saturation, and thin.
  A broad, soft, tinted specular lobe is wrong for this look; a tight band that
  desaturates toward white as it brightens is right.
- **In a warm low key, hair collapses to black and only the streak carries the
  colour.** Gladiolus's brown hair medians at `#140907` (Y≈11) and only reaches
  `#471f09` at p99. The hair's stated "brown" exists almost entirely in the
  top 1% of its pixels.

### 12.4 Cloth and leather: very low albedo, blue-shifted by sky bounce

| Plate | Material | Region | p10 | p50 | p90 | p99 |
|---|---|---|---|---|---|---|
| `character-prompto-daylight-01.jpg` | black studded leather vest, **full sun** | x 0.31–0.39, y 0.50–0.70 (px 595–749, 540–756) | `#010302` | `#070908` | `#2f3431` | `#53504d` |
| `character-noctis-face-01.jpg` | black jacket, cool ambient | x 0.28–0.44, y 0.60–0.92 (px 538–845, 648–994) | `#060807` | `#111312` | `#1c2023` | `#5d6055` |
| `character-noctis-mastershot-04.jpg` | jacket, studio | x 0.52–0.62, y 0.32–0.52 (px 757–903, 241–392) | `#030408` | `#171a21` | `#2c303b` | — |
| `character-gladiolus-sunlit-02.jpg` | dark ribbed knit tank, **full sun** | x 0.755–0.825, y 0.40–0.60 (px 1450–1584, 432–648) | `#010302` | `#11191c` | `#405057` | `#68757d` |
| `character-gladiolus-face-01.jpg` | leather jacket, warm key | x 0.42–0.56, y 0.62–0.95 (px 806–1075, 670–1026) | `#330100` | `#6f3b0f` | `#f98740` | `#fda050` |

- **Black leather in direct sunlight still medians at Y≈8/255** (`#070908`) and
  its brightest specular only reaches `#53504d` (Y≈80). That is not a mirror
  hit — it is a broad, dim sheen. Leather here is high-roughness with a low
  specular intensity, and its *albedo* is genuinely near-zero.
- **Dark cloth in sunlight goes blue, not neutral.** The knit tank's lit band is
  `#405057` (64,80,87) and its highlight `#68757d` (104,117,125) — `B > G > R`
  in both. In the shade of §12.1's skin it was the opposite. This is sky-dome
  bounce on a low-albedo surface: with almost no diffuse contribution of its
  own, a black garment renders essentially the colour of its environment
  lighting. Our renderer needs a real sky irradiance term for this, not a
  constant grey ambient.
- **With a strong key, leather's range explodes.** Gladiolus's jacket runs
  `#6f3b0f` (Y≈67) at p50 to `#f98740` (Y≈166) at p90 — a 2.5x jump across the
  garment in one frame, versus 4x total across all of Prompto's vest. Leather
  is the material that most rewards a strong key light; cloth is not.

### 12.5 Albedo calibration chart — four garments, one sun

`party-four-casual-01.jpg` (1920×1080) is worth calling out on its own: it puts
white, grey, saturated red and black cloth plus sunlit skin in a single frame
under identical bright coastal daylight. Sampled:

| Garment | Region | Shadow (p10) | Median (p50) | Lit (p90) |
|---|---|---|---|---|
| Noctis's white tee | x 0.28–0.40, y 0.55–0.72 (px 538–768, 594–778) | `#748388` | `#dfedf6` | `#ecfbff` |
| Ignis's grey knit henley | x 0.01–0.10, y 0.55–0.75 (px 19–192, 594–810) | `#3f4a56` | — | `#a7bfcb` |
| Prompto's red tank | x 0.55–0.66, y 0.55–0.70 (px 1056–1267, 594–756) | `#4f1b1d` | `#6c2a2c` | `#7a383c` |
| Gladiolus's black knit tank | x 0.80–0.92, y 0.50–0.68 (px 1536–1766, 540–734) | `#141615` | `#2a3135` | — |

- **A "red" shirt in full sunlight peaks at `#7a383c`, Y≈74/255.** Not
  `#cc2222`, not anything close. Saturated cloth in this game is rendered
  dramatically darker and duller than a naive albedo choice; the whole garment
  lives between Y 33 and Y 74. This is the single most likely place for our
  build to look like a different game.
- **The total cloth range in one sunlit frame is only about 5x** — black knit
  `#2a3135` (Y≈48) to white tee `#dfedf6` (Y≈235). Real-world cloth albedo
  spans 20x or more; FFXV compresses it hard at the bottom.
- **White cloth's own shadow is `#748388` (Y≈128), only ~1.8x below its lit
  value, and it is blue-grey** — the same sky-bounce effect as §12.4. White
  cloth also clips to Y≈249–252 without blooming, consistent with §4.

### 12.6 Silhouette, proportion, and feature scale

Measured on `character-noctis-mastershot-04.jpg` (1456×754), which is the only
plate in the corpus with a flat, known backdrop (`#79848f`) and therefore the
only one where a silhouette can be extracted reliably. The centre standing
figure was isolated by thresholding against the backdrop; its silhouette is
**726 px tall**, and the per-row silhouette width was profiled at 2.5% steps.

**Landmarks, as % of standing height measured from the tip of the hair:**

| Landmark | % of height | Landmark | % of height |
|---|---|---|---|
| tip of hair | 0% | waist | 45% |
| widest point of hair mass | 10% (96 px wide) | crotch | 50% |
| eye line | ~10% | wrist / fingertips | 52% |
| chin | ~14% | knee | 70% |
| shoulder line | ~18% | sole | 100% |
| elbow | 38% | max body width (shoulders/arms) | 223 px = 0.31 × height |

**Face-panel internal proportions** (same file, left panel, x 0–0.36 of frame),
as % of that panel's height: tip of hair 3%, top of skull under the hair 15%,
brow 33%, eye line 36%, base of nose 46%, mouth 50%, chin 57%.

That yields the numbers that actually matter for modelling:

- **Head-to-body ≈ 8.5–9 heads, not 7.5.** Skull-to-chin is 42% of the face
  panel while hair adds another 12% above it, so the hair-inclusive block that
  measures 14% of standing height corresponds to a true head of ≈11% —
  i.e. ~9 heads tall. Counting the hair as part of the head gives ~7 "hair
  heads". Both readings say the same thing: **the figure is markedly taller and
  slimmer than a realistic 7.5-head proportion**, with the extra length in the
  legs (crotch at exactly 50%, knee at 70%, and a 4%-of-height neck between
  chin and shoulder).
- **Hair adds ~29% to head height.** 12% of panel height of hair volume sits
  above a 42% skull. A capsule head with a thin hair cap will read short and
  blocky; the hair silhouette is a structural part of the character read, and
  in `character-noctis-face-01.jpg` it is also what breaks up the head's
  outline — individual strand silhouettes are visible against the background
  across the entire top and side profile, not just at a rim.
- **Eyes are ~1.4x oversized relative to a real face.** Face width
  temple-to-temple is 28% of the face panel's width; a single eye is ~8% of it.
  That makes each eye **≈29% of face width** — the face is about **3.5 eyes
  wide**, where a real face is five eyes wide. Pupil-to-pupil is 18% of panel
  width = 0.64 × face width.
- **The facial thirds are unequal, biased to the cranium.** Of the head's
  height: skull-top→brow 43%, brow→nose 31%, nose→chin 26%. Large forehead,
  compressed and small lower jaw. Combined with the oversized eyes this is the
  whole "Nomura face" in two numbers; a realistically-proportioned head will
  read as a different franchise even with identical shading.
- **Close-up framing puts the bare skin of the face at 28–32% of frame
  height.** Measured from the skin bounding boxes: Noctis y 0.230–0.549 (32%),
  Gladiolus y 0.200–0.499 (30%), Ignis y 0.219–0.499 (28%). Head-plus-hair is
  ~45% of frame height. A mid-shot (`character-prompto-daylight-01.jpg`,
  y 0.280–0.419) puts the face at only **14%**. So there are two distinct
  character framings in this game and nothing in between: a ~30% close-up and a
  ~14% mid-shot.

## 13. BEASTS: fur value range, silhouette, and reading against the sky

### 13.1 Fur and hide

| Plate | Region | p10 | p50 | p90 | p99 | Y p5 → p99.5 |
|---|---|---|---|---|---|---|
| `behemoth-roar-closeup-06.jpg` — dark behemoth muzzle + mane | x 0.14–0.45, y 0.20–0.60 (px 179–576, 144–432) | `#121315` | `#3b3b40` | `#85838d` | `#d8d4ea` | 12 → 224 |
| `behemoth-kaiser-snow-05.jpg` — *white* mane, snowfield | x 0.42–0.60, y 0.20–0.40 (px 538–768, 144–288) | `#2c2a2b` | `#6f6b66` | `#f1e7de` | `#fdf6eb` | 33 → 248 |
| `behemoth-deadeye-duscae-02.jpg` — Deadeye's hide, daylight | x 0.36–0.70, y 0.12–0.42 (px 691–1344, 130–454) | `#1c1a1f` | `#363034` | `#7e7b72` | `#a3a073` | 20 → 165 |

- **Fur has a much wider value range than any character material — 18x on the
  dark behemoth (Y 12 → 224) against 7x for hair and 5x for cloth.** The mane
  is where it happens: the shadowed undercoat sits at `#121315` while lit tips
  reach `#d8d4ea`. Modelling fur as a single mid-value shell will lose the
  creature entirely.
- **Dark behemoth fur is neutral-to-cool grey, not brown.** p50 `#3b3b40`
  (59,59,64) and p90 `#85838d` (133,131,141) both have `B ≥ R`, and the lit
  tips `#d8d4ea` (216,212,234) are frankly lavender. If our behemoth is warm
  brown it is off-model; the hide reads as wet slate.
- **"White" fur is not white.** Kaiser Behemoth's white mane medians at
  `#6f6b66`, Y≈107 — mid-grey — and only its top decile (`#f1e7de`) is
  actually bright. Its shadow `#2c2a2b` is 4x darker than its lit value, and
  unlike the dark behemoth, its *highlight* is warm (`#f1e7de`, R>G>B) while
  its shadow is neutral. White fur is a mid-grey body with a narrow warm
  highlight, not a white body with grey shadows.
- **Deadeye in daylight is darker than the grass it stands in.** Its hide
  medians `#363034` (Y≈50) against the sunlit-grass value of `#6f753b` (Y≈110)
  from §1. The boss is a dark mass moving through a light field — that value
  relationship, not its outline, is what makes it legible at distance.

### 13.2 How a boss reads against the sky

`behemoth-dread-skyline-03.jpg` is the cleanest case: a Dread Behemoth on a
clifftop against open sky.

- Torso, x 0.42–0.56, y 0.06–0.20 (px 776–1035, 62–207): p10 `#0a0607`,
  p50 `#0d0e10` — **Y ≈ 14**.
- Sky in the same frame, x 0.70–0.95, y 0.04–0.16 (px 1294–1756, 41–166):
  p50 `#659bbc` (Y≈146), p90 `#71b7e1` (Y≈173).
- **Ratio boss : sky ≈ 1 : 10.** The creature is rendered as a near-black
  cut-out.

The corroborating case, `beast-zu-sky-02.jpg` (a Zu isolated against clean blue
sky): body p10 `#192942` (Y≈40) against sky p10 `#548cbf` / p50 `#5c92c1` /
p90 `#6698c9` (Y 130 → 146) — a **3.5x** ratio, and note how *tight* the sky
range is: across a fifth of the frame the sky varies by only 16 luma levels.
FFXV's sky is a gentle gradient, so any creature in front of it is read almost
purely as a value cut-out.

The important negative result: **the creature does not pick up aerial
perspective.** §2 established that distant terrain lifts hard toward the sky
colour (`#bad2e4` on mountains). A behemoth at comparable apparent distance
stays at Y 14. Whatever distance-fog term our renderer applies to terrain must
*not* be applied at the same strength to gameplay-critical creatures, or the
boss will wash out and stop reading. This is a legibility rule masquerading as
a lighting rule.

At the extreme, `beast-adamantoise-sky-01.jpg` puts a creature against a
blown-out hazy horizon: shell x 0.10–0.55, y 0.30–0.75 gives p10 `#151513`,
p50 `#5b5b56`, p90 `#f0f1eb`, while the sky at x 0.75–0.98, y 0.05–0.25
medians `#e1f2fa` and clips to `#ffffff` above p90. One creature silhouette
spans essentially the entire tonal range of the frame.

### 13.3 Silhouette language

Read directly off `behemoth-deadeye-duscae-02.jpg`,
`behemoth-dread-skyline-03.jpg` and `behemoth-roar-closeup-06.jpg` (shape
observation, not sampled colour):

- The behemoth reads as a **long, low, horizontal mass**: a deep chest and a
  heavy shoulder hump carried well forward of dropped hindquarters, with the
  head slung low and forward rather than held up. The visual weight is all in
  the front third.
- **The extremities do the identifying work.** A pair of long, forward-swept
  horns and a very long trailing tail extend the outline to roughly 2.5–3x the
  torso's height in overall width. In `behemoth-dread-skyline-03.jpg` it is the
  horns that break the skyline above the back line — at silhouette scale the
  torso is an anonymous blob and the horns and tail are the whole read. A
  behemoth built with correct proportions but stubby horns will not be
  recognisable at gameplay distance.
- **The mane is a separate silhouette layer.** In the roar close-up, the mane's
  lit tips (`#d8d4ea`) break the head's outline into ragged strands against the
  background, exactly as the party's hair does in §12.6 — the same
  silhouette-breaking treatment scaled up.

---

## Top 10 art-direction facts (summary)

1. **Split-tone grade is directional, not palette-based**: shadows push
   cyan/teal (sampled shadow pixels consistently show G/B ≥ R) and
   highlights push warm/orange, regardless of the actual light source colour
   — verified even in a warm-sunset shadow (`#1d241a`, G>R under golden-hour
   light).
2. **Blacks are lifted and filmic**: the darkest sampled pixel in the whole
   corpus is `#010409`; nothing crushes to literal 0,0,0. Use a raised black
   floor and soft highlight shoulder, not a raw linear clip.
3. **Base saturation is low**: sunlit "green" grass samples as a desaturated
   olive `#6f753b`, not a vivid green — don't oversaturate foliage.
4. **Aerial perspective is aggressive**: distant mountains sample as pale
   near-white-blue (`#bad2e4`), a 3-4x lightening and near-total desaturation
   versus foreground terrain in the same frame.
5. **Sun sits low-to-mid, never zenith**: even "midday" shots read as ~35-55°
   sun elevation; golden-hour shots run ~5-15°. There is no flat overhead-sun
   look anywhere in the corpus.
6. **Bloom is reserved for true overexposure and VFX**, not applied to
   diffuse bright materials (white cloth, sunlit skin stay bloom-free while
   the sun disc and spell effects clip to pure white with wide soft skirts).
7. **DOF is off during gameplay/HUD-on combat and exploration**, only
   engaging (mildly, background-only) in directed cutscene-style
   compositions.
8. **Motion blur is VFX/trail-based, not a global screen-space pass** — fast
   character motion (warp-strike) stays sharp on the character while the
   accompanying particle trail streaks.
9. **Grass uses at least two LOD tiers**: near-camera blade-card geometry
   with backlit rim/SSS, falling back to a blended clumped ground texture at
   mid distance; bushes are built from ~4-8 rounded leaf-clump cards, not
   fine leaf geometry.
10. **The combat HUD is a fixed four-corner layout**: minimap top-right,
    weapon wheel (glowing blue ring, `~#5e67bc`-`#8e99e8`) bottom-left, party
    HP/MP stack bottom-right (white-fill HP bars, cyan-to-violet MP gradient
    on Noctis's row only), with enemy name/HP and floating damage numbers
    positioned in world-space above the target rather than in a fixed HUD
    slot.

## Seven more, from the round-2 character and creature plates (§12–13)

11. **Skin lit:shadow is only 2.0–3.2x, and skin shadows stay warm** (`#6c5646`
    under a *cool* key in `character-noctis-face-01.jpg`) while environment
    shadows push cyan (§1). A global shadow-tint applied to characters, or a
    strong sun with a weak ambient fill, both break the face immediately.
12. **About half of every face is in shadow, in every plate** (45–63%, median
    51%). FFXV never front-lights a face flat; the key is always off-axis and
    the fill is what keeps the shadow side readable.
13. **Hair is near-black and blue-tinted, with a thin desaturating streak.**
    Black hair medians `#1f2630`; *blond* hair in full sun still only medians
    `#4a5453` (Y≈81). The specular reaches a neutral `#838786` in the top few
    percent of pixels — narrow and colourless, not a broad tinted lobe. Hair
    also adds ~29% to head height and breaks the silhouette with visible
    strands all round, not just at a rim.
14. **Saturated cloth is rendered very dark: a red tank in full midday sun
    peaks at `#7a383c` (Y≈74).** Total cloth range in one sunlit frame is only
    ~5x (black knit `#2a3135` → white tee `#dfedf6`). Low-albedo garments also
    go visibly *blue* in sun (`#405057`) from sky bounce, in the same frame
    where skin stays warm.
15. **Proportions are ~8.5–9 heads with a 50% crotch line, and eyes are ~1.4x
    oversized** — the face is 3.5 eyes wide, not five, with a 43/31/26 split of
    the facial thirds (big cranium, small jaw). Close-ups frame the bare face
    at 28–32% of screen height; mid-shots at ~14%; nothing in between.
16. **Fur has the widest value range of any material — 18x** (`#121315` →
    `#d8d4ea` on one behemoth mane), dark behemoth fur is neutral-to-cool grey
    rather than brown, and "white" fur medians at mid-grey `#6f6b66` with only
    its top decile actually bright.
17. **A boss against the sky is a near-black cut-out at ~1:10 luma
    (`#0d0e10` vs `#659bbc`) and picks up NO aerial perspective** even though
    terrain at the same distance lifts to `#bad2e4` (§2). Distance fog must be
    weakened or suppressed on creatures or the boss stops reading. Its
    identity comes from the horns and tail — extremities that widen the
    silhouette to 2.5–3x torso height — not from the torso.
