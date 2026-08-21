# Handoff — `agent/grass`

Branch `agent/grass`, four commits ahead of `main` @ `76e19ae`.
Owned files, and the only files touched: `src/world/veg/{GrassField,VegTextures,VegMaterial,Ecology,Biomes}.js`.
Nothing under `src/world/terrain/**` was edited.

Capture rounds live in `tmp/shots/gr0` (baseline) through `tmp/shots/gr7`. Every PNG in
every round was looked at.

---

## 1. State at a glance

| Item | State |
|---|---|
| LOD value mismatch (the darkness bug) | **Done, verified by eye** |
| Shared height contract across the three rings | **Done, verified by eye and by instrumented measurement** |
| Grass scale — Leide back to an ankle tuft | **Done, verified by eye** |
| Tint maths rewrite — the acid yellow | **Done, verified by eye and by measurement** |
| Leide palette re-authored toward dusty khaki | **Done, verified by eye** |
| Duscae / Cleigne read as green | **Verified, no change needed** (`tmp/shots/gr7/poi_chocobo.png`) |
| Blade silhouette, per-blade bend | **Done, verified by eye** |
| Backlit translucency on the card rings | Done, **partially verified** — see §6 |
| Per-clump wind (no more single plane wave) | Done, **not verified** — stills cannot show it |
| Trees / bushes (plan item F) | **Not started** — see §7 |

---

## 2. The LOD darkness bug — root cause and fix

This was the most valuable finding of the pass and nobody had flagged it.

**Root cause.** LOD0 is real blade geometry with *no map at all*, so its albedo
is its vertex colour: an area-weighted mean of **0.688**. LOD1 and LOD2 are
alpha-cut cards whose map, `grassClumpTex`, was drawn as luminance in the
**96–224 sRGB** band — a coverage-weighted mean *linear* luminance of **0.343**.
`crossCardGeometry` then multiplied that by a second vertical vertex ramp
(0.50→0.98, coverage-weighted mean 0.671) before `aoBoost` darkened the base a
third time.

Product: card ring **0.230** against blade ring **0.688** — the card rings
rendered **3× darker** than the ring they take over from, at the same instance
tint under the same sun. On screen: glowing straw out to thirty metres and a
carpet of near-black gravel immediately past it, in one frame. Worst in
`tmp/shots/gr0/zone_fallgrove.png`, `zone_longwythe.png` midground, and the entire
foreground of `haven_dusk.png`.

No palette or lighting change could ever have reached it. It is a property of
the texture.

**Fix** (commit `37ea3db`):

- `VegTextures.normalizeAlbedo(data, target)` pins a card's alpha-weighted mean
  linear luminance by binary-searching a **gamma on luminance** and scaling RGB
  by the resulting ratio. Chosen over a flat multiply for two reasons: a gamma
  maps 0..1 onto 0..1 so it cannot clip the blade tips to white, and scaling by
  the luminance ratio leaves each texel's chroma exactly where it was drawn,
  preserving the "luminance-only, the instance colour supplies the hue"
  contract the clump card is built on. Runs before the mip chain, so every level
  inherits the corrected albedo. Exposed through `alphaTex`'s new `albedo`
  option — reusable for the leaf cards when someone does the tree pass.
- `GRASS_CARD_ALBEDO = 0.58` (exported from `VegTextures.js`) is the number the
  field is tuned against.
- `crossCardGeometry`'s vertical ramp 0.50→0.98 becomes 0.86→1.06
  (coverage-weighted mean 0.931). The clump texture already paints a
  root-to-tip gradient into every blade it draws; the geometry ramp was
  double-counting it.

Card ring now lands at 0.931 × 0.58 = **0.54**, about four-fifths of the blade
ring. Deliberately not equal — a card is a whole tuft at thirty metres with its
own self-shadowing — but four-fifths is a shade and 3× is a different material.

**Verified**: `tmp/shots/gr1/zone_fallgrove.png` versus `tmp/shots/gr0/zone_fallgrove.png`
— the black gravel is gone and reads as sage-green scrub. `haven_dusk`'s
foreground reads as grass instead of a void.

---

## 3. Scale — measured, not guessed

I instrumented the live scene through the capture daemon's `/eval` route and
read the actual instance matrices. At Hammerhead, **before**:

| ring | mean height | max height |
|---|---|---|
| 0 blades | 0.171 m | 0.407 m |
| 1 cards | 0.340 m | 0.668 m |
| 2 cards | 0.604 m | **1.068 m** |

That is **1 : 2 : 3.5** across a boundary the eye is supposed to be unable to
find. Half of why the grass read as knee-high straw is simply that a metre-tall
card stood where a 0.2 m tussock belongs.

**After** (commit `1e27601`): 0.093 / 0.178 / 0.259 on the means and
**0.277 / 0.333 / 0.499** on the maxima — **1 : 1.20 : 1.80**, and what remains
of that spread is the honest difference between one blade, one tuft and a stand
of several.

The mechanism is `tuftHeight(d, wet, hMul, jitter)` in `GrassField.js`: the one
height law, returning the apparent height of a single tuft. Each ring multiplies
it by its own `LODS[i].hMul` (1.0 / 1.05 / 1.45) and *nothing else*, so a blade
tuft and the card that replaces it can no longer drift. The zone `grassH`
multiplier still takes Alstor Slough and the Vesperpool to waist-high reed.

Compensating changes so shorter grass does not read bald: tuft grid 0.36 → 0.27 m
with blades-per-tuft roughly halved (more, smaller plants — open dirt between
them, which is what Leide scrub is); tuft radius now follows tuft height
(0.26–0.56×) instead of an absolute range that worked out at 0.83× — a tuft that
wide is a pancake, and a pancake of blades is the shape that reads as an
unbroken mat; cards proportionally wider; ring radii 30/95/190 → 26/84/155.

**Net cheaper**: at `hero_face`, 301,737 instances / 164 grass draws →
248,281 / 128. Total draw calls 502 → 496.

---

## 4. Colour — the tint maths, not the palette

The acid yellow was never the palette. `GrassField.tint` applied
`r * (1 + dry*0.44)` and `b * (1 - dry*0.40)` on top of whatever the biome
authored — roughly **×1.8 red and ×0.6 blue** at the dry end — plus a value
jitter that could only lift. Measured at Hammerhead the field sat at
**r/g 1.76, b/g 0.21**, from a ramp whose own dry end is 1.33 and 0.33, with
peak instance channels at **0.974** (i.e. an albedo at the ceiling; some
combinations exceeded 1). A channel gain applied *after* the palette cannot be
undone by editing the palette, which is why recolouring rounds kept failing.

Replaced (commit `c08c1a4`) with four steps that are all bounded by the palette:

1. Walk the zone's **own** ramp toward the zone's **own** dry end — new
   `Ecology.grassDryColor` / `Ecology._grassRamp` — instead of synthesising
   straw out of a red gain.
2. A per-clump **hue** jitter at constant luminance. Every jitter in the file
   used to be value-only, and a field whose only variation is brightness
   averages back to one flat colour past a few metres.
3. A pull back toward each clump's own luminance, so no clump can be more
   saturated than the palette allows, and bleaching reads as the loss of chroma
   it actually is.
4. Value jitter symmetric about the base rather than one-way.

**A trap worth knowing**: in Leide the local grass colour is *already* the ramp's
dry end, so with nothing further along to interpolate toward, step 1 alone did
literally nothing and the whole flats came out uniformly sage
(`tmp/shots/gr3/hero_face.png`). `dry` therefore also pushes the hue axis, which is
luminance-preserving and still bounded by step 3.

Also: the blade's root-to-tip vertex ramp now carries hue as well as value (base
darker and greyer, tip lighter and strawier) instead of one constant warm cast;
the Leide `dry`/`lush` pairs in `Biomes.js` are re-authored toward dusty khaki.

**Measured after**, same spot: **r/g 1.30, b/g 0.57**, mean linear luminance
**0.243** (was 0.296), peak channel **0.506** (was 0.974). The three rings now
agree on mean tint to within 2% — 0.305 / 0.304 / 0.300, against
0.471 / 0.416 / 0.399 before.

---

## 5. Ground colour — what I assumed (read this alongside `agent/splat`)

`GrassField` blends every clump's colour toward `Ecology.groundColor`, which
delegates to the terrain. I pulled that blend from **0.32 to 0.22**
(`GROUND_BLEED` in `GrassField.js`) because a third of every blade's hue was
coming from the terrain's macro tint — which `agent/splat` independently
confirmed is a hard-coded Leide ochre that never reads `WorldMap` — so it was
dragging Duscae's grass toward the desert too.

**My colour judgements were all made against the current ochre ground.** When
`agent/splat` lands, the two must be re-judged together: if the ground under
Duscae goes green, the grass there will read greener than I saw it, and
`GROUND_BLEED` may want to go back up now that the value it bleeds in is
regionally correct. Nothing else in my work depends on the ground.

I also did **not** touch the `lowAlt` gate that `agent/splat` reported gates
grass off above 120 m — it is on their side of the boundary. It is visible in
`tmp/shots/gr5/zone_three_valleys.png`, which is a high aerial with almost no grass.

---

## 6. Performance

**Every number below was taken with six or more sibling agents live. Treat them
as indicative only; re-measure on a quiet tree before judging.**

- `src/tools/perf.mjs`, load average 2.3 rising to 5.1 during the run:
  **mean 73.6 fps, worst 39.1 fps (`vista_dawn`)**, which the tool reports as a
  FAIL against its 60 fps target. **I have no before/after comparison** — I did
  not baseline `perf.mjs` before the first edit, which was a mistake. `perf.mjs`
  was already failing its gate on `main` per `project/SESSION-STATE.md` (`gameplay.mjs`
  `walk` at ~57.5 fps, shadow cascades ~22 ms dominating), so the failure is
  very unlikely to be mine, but that is an inference and not a measurement.
- What I *can* state as a direct comparison, from the capture manifests, same
  machine, minutes apart:
  - `hero_face`: 4,835,746 tris / 502 calls → 4,839,xxx / **496** calls
  - grass instances at `hero_face`: 301,737 → 248,281 (**−18%**)
  - grass draw calls at `hero_face`: 164 → **128**
  - `zone_fallgrove` grass draws: 118 → **86**
  - triangles net roughly flat: the height/density work took ~3% off, the
    five-segment blade put ~3.5% back.
- Draw calls across the twelve-shot set stayed in 378–596, inside the 800 budget.

`src/tools/gameplay.mjs` was **not run** — it is the expensive one and the machine
was contended.

---

## 7. Exact next steps, in priority order

1. **Re-judge grass against the new terrain** once `agent/splat` merges. See §5.
   This is first because it may invalidate small colour calls cheaply.
2. **Trees and bushes — plan item F, not started.** `tmp/shots/gr7/zone_malacchi.png`
   is the evidence: the broadleaf canopy is candy green with blown, nearly white
   highlights in the sun. Two specific leads, both already scouted:
   - `VegTextures.leafClusterTex('broad')` draws at `g = 66 + shade*62` with
     ratios `(0.87, 1, 0.70)`. The same `normalizeAlbedo` hook added for the
     grass cards (`alphaTex`'s `albedo` option) is the right tool — the leaf
     cards have never had their albedo pinned either, so the tree LODs may well
     carry the same class of mismatch the grass did. **Check that before
     touching the ratios.**
   - `Trees.js:288` and `:326` compose `shade * SPECIES_TINT[sp] * b.treeTint`
     with `shade = 0.62 + rng.next()*0.40` — up to 1.02 before either tint. Same
     "albedo over 1" shape as the grass tint bug had.
   - The Nebulawood and Malmalam interiors (`tmp/shots/gr5/zone_nebulawood.png`,
     `zone_malmalam.png`) are dark, humid and heavily hazed — I judged them
     **correct for the brief**, not too dark. Do not "fix" them.
3. **Verify the wind by eye in motion.** Stills cannot show it. The gust is no
   longer a plane wave; that needs a moving capture or a live look.
4. **Baseline and re-measure `perf.mjs` and `gameplay.mjs`** on a quiet tree.
5. Optional polish: the near field in `tmp/shots/gr6/hero_face.png` still leans a
   touch uniformly green for Leide. The lever is the `dry * 0.55` hue push in
   `GrassField._makeTile`, not the palette.

---

## 8. Gotchas and dead ends

- **`#include <project_vertex>` — do not consume it.** `VegMaterial.patchVeg`
  folds the sway into `transformed` inside `<begin_vertex>` precisely so it does
  not eat the `<project_vertex>` marker that `world/sky/MaterialPatch.js`
  replaces to write `vAtmWorld`. Consume it and every leaf and grass card
  computes its eye distance as `length(cameraPosition)`, so all vegetation more
  than a kilometre from Hammerhead floods to 100% sky inscatter — flat
  blue-white cards over brown ground. The existing comment says all this; I left
  it intact and verified distant vegetation is clean on
  `tmp/shots/gr5/vista_noon.png` and `zone_three_valleys.png` after every shader
  edit. **Check those two shots after any change to `VegMaterial.js`.**
- **GLSL reserved words cost me two full rounds.** A local in the vegetation
  shader may not be called `cross` or `patch` — both are reserved, and both fail
  as `'Illegal use of reserved word'` at *link* time behind the useless message
  `THREE.WebGLProgram: Shader Error 1282 - VALIDATE_STATUS false`. Now commented
  in place at `VegMaterial.js`.
- **`shoot.mjs --no-daemon` did not surface those shader errors; the daemon path
  did.** I could not reproduce them on the `--no-daemon` route at all. If you
  are hunting a shader bug, use the daemon, and get the *full* error text — the
  daemon's `/shots` response carries it but `shoot.mjs` prints only
  `e.split('\n')[0]`, which throws away the shader source and the actual GLSL
  diagnostic. A five-line script against `call('/shots', …)` printing the whole
  string is what found it.
- **Backticks inside the `/* glsl */` template literals terminate the string.**
  Two parse errors from writing `` `cross` `` in a shader comment.
- **The vegetation shader comment blocks are load-bearing.** `specular: 0` on
  the card rings, the `twoSidedNormals` flip and the per-instance normal-matrix
  note in `bladeGeometry` are each a documented bug fix. Read them before
  changing any of those values.
- **Do not use a per-instance hash for per-clump wind.** An instance origin in
  the blade ring is *one blade*, not one plant, so a positional hash gives the
  blades inside a tuft different phases and shreds the tuft. I used two smooth
  functions of world position instead (a cross-wind wave on the phase, a large
  drifting field on the amplitude).
- **A shared scratchpad is shared.** Another agent overwrote my probe script
  mid-session. Name scratch files with your agent id.

---

## 9. Cross-boundary items

- `src/world/veg/Ecology.js:497-500` — `groundColor` delegates to
  `Terrain.groundColorAt` / `Terrain.colorAt`. This is the only coupling from
  vegetation into terrain colour, and it is read-only. `agent/splat` changing
  either function changes my grass. See §5.
- `src/world/terrain/**` `lowAlt` gate — reported by `agent/splat` as gating
  grass off above 120 m. **Not mine, not touched.** Visible in
  `tmp/shots/gr5/zone_three_valleys.png`.
- `src/tools/orphans.mjs` reports one orphan, `src/world/map/MapRaster.js`. It is
  pre-existing and belongs to the coordinator's `src/world/map/**`. Not mine.

---

## 10. Gate status

| gate | result |
|---|---|
| `npx vite build` | **PASS** (also enforced by the pre-commit hook on all four commits) |
| `node src/tools/integration.mjs` | **PASS** — 18 pass, 0 wired-but-unproven, 0 not integrated |
| `node src/tools/orphans.mjs` | **PASS for my files** — 260/261 reachable; the one orphan is the pre-existing `src/world/map/MapRaster.js` |
| `node src/tools/shoot.mjs` page errors | **0** across the final twelve-shot set |
| `node src/tools/perf.mjs` | **FAIL at `vista_dawn` 39.1 fps**, under heavy contention, with no before-baseline. See §6 |
| `node src/tools/gameplay.mjs` | **not run** |
