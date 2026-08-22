# Handoff — vegetation (`agent/grass`, then `agent/veg`)

Owned: `src/world/veg/**`, `src/world/Vegetation.ts`, this file.
Nothing under `src/world/terrain/**` has ever been edited from here.

Capture rounds: `tmp/shots/gr0`-`gr7` (the grass pass), `tmp/shots/veg0`-`veg2`
(the lost tree-albedo agent), `tmp/shots/veg-a1` (this session's inherited-state
baseline) through `veg-a2`, `veg-b22`/`veg-b34` (the `GROUND_BLEED` A/B),
`veg-c1`, `veg-final` (12 shots), `veg-zones` (12 more, with `_sheet-1.jpg`),
`veg-wind-choco`/`veg-wind-haven` (motion strips). Every image was looked at.

Sections 2-4 are the grass pass and are still accurate. Section 5.5 is this
session. Section 8 is the list that will cost you a round each if you skip it.

---

## 1. State at a glance

| Item | State |
|---|---|
| LOD value mismatch (the grass darkness bug) | **Done, verified by eye** |
| Shared height contract across the three grass rings | **Done, verified by eye and by measurement** |
| Grass scale — Leide back to an ankle tuft | **Done, verified by eye** |
| Grass tint maths rewrite — the acid yellow | **Done, verified by eye and by measurement** |
| Leide palette re-authored toward dusty khaki | **Done, verified by eye** |
| Blade silhouette, per-blade bend | **Done, verified by eye** |
| Backlit translucency on the card rings | Done, **partially verified** — see §6 |
| Per-clump wind (no longer a plane wave) | **Done, verified in motion** — see §5.5 |
| Bark albedo (every trunk was rendering at ~0.003) | **Fixed, now verified by eye** |
| Leaf-card vertex shade over 1 in `TreeBuilder` | **Fixed, now verified by eye** |
| Leaf-card albedo pinned (`LEAF_CARD_ALBEDO`) | **Done, verified — the hook does run** |
| Canopy chroma no longer stacked three deep | **Fixed, now verified by eye** |
| Tree species grove band → monoculture near ring | **Fixed and measured** — see §5.5 |
| `GROUND_BLEED` re-judged against the new terrain | **Done, 0.22 → 0.34** — see §5.5 |
| "Camera inside the crown" cull | **Fixed** — `zone_alstor` was a black frame |
| Bushes / ferns / reeds | **Never touched by anyone** |
| Perf re-baselined on a quiet tree | **Still not done** — see §6 |

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
- `GRASS_CARD_ALBEDO = 0.58` (exported from `VegTextures.ts`) is the number the
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

The mechanism is `tuftHeight(d, wet, hMul, jitter)` in `GrassField.ts`: the one
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
the Leide `dry`/`lush` pairs in `Biomes.ts` are re-authored toward dusty khaki.

**Measured after**, same spot: **r/g 1.30, b/g 0.57**, mean linear luminance
**0.243** (was 0.296), peak channel **0.506** (was 0.974). The three rings now
agree on mean tint to within 2% — 0.305 / 0.304 / 0.300, against
0.471 / 0.416 / 0.399 before.

---

## 5. Ground colour — what I assumed (read this alongside `agent/splat`)

> **Superseded by §5.5.** `agent/splat` has landed, the ground is regionally
> coloured, and `GROUND_BLEED` is back up at 0.34. Kept for the reasoning.

`GrassField` blends every clump's colour toward `Ecology.groundColor`, which
delegates to the terrain. I pulled that blend from **0.32 to 0.22**
(`GROUND_BLEED` in `GrassField.ts`) because a third of every blade's hue was
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

## 5.5 This session (`agent/veg`) — trees, and the ground under them

Four commits were inherited from a lost agent (`worktree-agent-ae5fcae26e8ee3516`,
merged as `5076c3e`) and **none of them had ever been looked at**. They are all
good and they are all now verified by eye against `tmp/shots/veg-a1/`:

- **Bark albedo.** `barkMaps` was writing a *linear* colour into an sRGB-tagged
  byte texture *and* baking the species tint into a map that the material's own
  `color` applies a second time. Measured result ~0.003 against a real bark
  value of 0.10-0.15 — every trunk in the game was a flat black stick. It is now
  a detail map: sRGB-encoded, normalised to `BARK_DETAIL_MEAN = 0.64`, near
  neutral in hue. **Verified**: `veg-a1/poi_chocobo.jpg`, `zone_longwythe.jpg`
  — trunks read as wood at every time of day.
- **Leaf-card vertex shade over 1.** `TreeBuilder` multiplied three factors each
  allowed slightly over one, reaching 1.42. `Math.min(1, …)`. **Verified**: the
  blown near-white canopy highlight in `zone_malacchi` is gone.
- **Leaf-card albedo pinned.** `leafClusterTex` now goes through `alphaTex`'s
  `albedo` option at `LEAF_CARD_ALBEDO = 0.125`. I checked the hook actually
  fires — `alphaTex:224` calls `normalizeAlbedo` before `withAlphaMips`, so every
  mip inherits it, and the impostor and stand-card bakes read the pinned texture
  because they bake from `leafMat.map` after `build()`. This was the one thing
  §7 said to check *before* touching ratios; it was checked and it is done.
- **Canopy chroma stacking.** `Trees.composeTint` splits each tint into luminance
  and unit-luminance chroma so the luminances multiply and the chromas *blend*.
  The candy lime is gone.

Then four fixes of my own.

### The tree-species grove band — the big one

`Ecology.treeSpecies` picked from **one** simplex field at frequency 0.0022, a
~450 m wavelength, while `Trees.geoRange` is **88 m**. The near ring is smaller
than one lobe of a smooth field, so wherever the band sat, every tree the
geometry ring drew was the same species, with no possible exception.

Measured at the chocobo post, biome `alstor` (swamp 0.58, duscae 0.18, broadleaf
0.14, dead 0.10): **76%** of the 88 m disc resolved to `dead`, and the near ring
came back **116 dead, 0 swamp, 0 duscae** — the whole 130-tree geometry budget
spent on bare grey sticks, in a wetland. `veg-a1/poi_chocobo.jpg` is a field of
leafless trees where the table asks for closed green wood.

Fixed with a second ~40 m octave (`grove * 0.74 + local * 0.30`, total amplitude
0.62 → 0.72 because summing two noises narrows the distribution and squeezes the
ends of the cumulative table). **Not** a per-tree hash — that is an even salad of
every species at every scale, which is the look the grove noise exists to kill.

World-wide share against the authored weights afterwards, sampled on a 53 m grid
over the whole map: dead 0.427/0.419, savanna 0.137/0.161, broadleaf 0.183/0.170,
duscae 0.106/0.091, swamp 0.061/0.071, conifer 0.065/0.068, thicket 0.020/0.020.
Near ring at the same spot: 63 dead / 56 broadleaf / 11 duscae.

**Verified**: `veg-a2/poi_chocobo.jpg`, and `veg-zones/_sheet-1.jpg` confirms no
zone lost its character.

### `GROUND_BLEED` 0.22 → 0.34

The cut to 0.22 existed only because the terrain's macro tint was a hard-coded
Leide ochre that never read the world map. It is regional now, so the reason is
gone. Judged on a matched A/B, `tmp/shots/veg-b22/` against `veg-b34/`:

- `poi_chocobo` — `grassColor` there returns linear **r/g 0.44, b/g 0.22** (the
  `alstor` lush end, more saturated than any real sward) against a ground of
  r/g 1.23, b/g 0.42. At 0.22 the near field is flat emerald lawn; at 0.34 it is
  olive with dirt reading between the tufts.
- `hero_face` — the bigger win. Leide goes from a uniform yellow-green mat to
  warm khaki tussocks over open ochre dirt.

Grass instance counts are unchanged by this; it is colour only.

### The "camera inside the crown" cull

The rule used a flat 12 m radius. A `duscae` tree is 19 m before its scale
multiplier with a crown eight metres or more across, so one rooted fifteen metres
away still wraps a camera at canopy height. `zone_alstor` was an **almost
entirely black frame** and the probe found *no instance of anything* within 10 m
of the lens — the occluder was outside the flat radius.

Now `0.55 * h + 3` (~16 m for that Duscae tree, ~8 m for a Leide scrub tree,
which is what the flat number was tuned on). The `cullFloor` guard is untouched,
so it still only bites when the eye is properly up in the crown.

`veg-c1/zone_alstor.jpg` is now a hazed wetland vista — layered mist over the
slough, treelines fading to blue, the rock spire on the sky. `poi_chocobo` keeps
its near ring; Nebulawood and Malmalam are unchanged in character.

### Wind, verified in motion

> **The `tmp/veg-a489/` scripts named below are gone** — `tmp/` is disposable by
> design and was cleared. The method is what survives; rebuild the two scripts
> (they are short) or promote them into `src/tools/`. Kept because a motion
> check is the only way to judge wind and nothing in the harness does it.

Stills cannot show a gust, so: `tmp/veg-a489/windstrip.mjs` boots one page,
applies a shot, and screenshots every N `GAME.settle()` steps;
`tmp/veg-a489/motionmap.mjs` writes the amplified per-pixel difference of two
frames as a PNG. A plane wave shows up as a moving band; a per-clump field shows
up as scattered patches.

`tmp/veg-a489/wind-choco-02.png` (poi_chocobo, 22 sim steps apart): trunks are
almost black (rigid, as `flexPow` intends), leaf tips are bright, and **different
trees in the same frame are at visibly different amplitudes** — not a band. The
grass shows the same patchiness. Amplitude is a believable breeze, checked
directly on the raw frames (`tmp/veg-a489/w0.png` / `w2.png`): the crown shifts,
the outer tips move more than the interior, the trunk is fixed.

### Instance and draw counts, before → after (this session)

Probed on the same three shots with `tmp/veg-a489/probe7.mjs`, before = the merge
commit `5076c3e` restored into the tree:

| shot | tree geo | tree impostor | canopy cards | grass | draws |
|---|---|---|---|---|---|
| `poi_chocobo` | 278 → **331** | 1573 → 1573 | 468 → **229** | 382,002 → 382,002 | 530 → **537** |
| `hero_face` | 190 → 190 | 95 → 95 | 291 → 291 | 260,699 → 260,699 | 478 → 478 |
| `zone_fallgrove` | 230 → **244** | 1190 → **1169** | 215 → 213 | 381,028 → 381,028 | 454 → **462** |

Draw calls across the final twelve-shot set (`tmp/shots/veg-final/manifest.json`)
run **378-582**, worst `haven_dusk` at 582, against a budget of 800. Forest zones
gained 7-8 calls because a mixed near ring fills more variant meshes than a
monoculture did; Leide is unchanged.

---

## 6. Performance

**Every number below was taken with six or more sibling agents live. Treat them
as indicative only; re-measure on a quiet tree before judging.**

- `src/tools/perf.mts`, load average 2.3 rising to 5.1 during the run:
  **mean 73.6 fps, worst 39.1 fps (`vista_dawn`)**, which the tool reports as a
  FAIL against its 60 fps target. **I have no before/after comparison** — I did
  not baseline `perf.mts` before the first edit, which was a mistake. `perf.mts`
  was already failing its gate on `main` per `project/STATUS.md` (`gameplay.mts`
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

`src/tools/gameplay.mts` was **not run** — it is the expensive one and the machine
was contended.

---

## 7. Exact next steps, in priority order

1. **Baseline and re-measure `perf.mts` and `gameplay.mts` on a quiet tree.**
   Still the largest unknown in this directory. No vegetation number in this file
   was ever taken with fewer than six sibling Chromiums live. The near ring gained
   ~50 geometry trees at `poi_chocobo`; that is the only cost change worth a look.
2. **Bushes, ferns and reeds have never been touched by anyone.** `Bushes.ts` is
   491 lines nobody has audited. They pick their species per instance
   (`pickFrom(b.scrubTable, rng.next())`), so they do *not* have the grove bug,
   but their albedo has never been pinned the way the grass and leaf cards now
   are — that is the same class of defect twice found and twice worth money.
3. **`zone_fallgrove`'s ground reads as dark green grass dots on a pale grey-green
   mat.** Measured: `Terrain.groundColorAt` there returns linear lum 0.090, r/g
   1.34 — a *warm brown* — while the rendered ground is pale and desaturated
   green. Vegetation tints itself from `groundColorAt`, so the two disagree and
   the grass ends up darker than the mat it stands in. Deciding which side is
   wrong needs the terrain owner; see §9.
4. **`zone_malacchi` is a wall of leaf card.** The cull fix rescued `zone_alstor`
   but not this one — the camera sits inside a grove of small broadleaf whose
   crowns are under the cull radius. The frame is not *broken* now, but it is a
   green wall and it is the zone's only shot. The framing lives in `Shots.ts`
   (coordinator).
5. **Leaf cards read as soft spray at mid distance.** Crisp and leaf-shaped in a
   closeup (`veg-c1/zone_malacchi.jpg`), mushy at 20-40 m. Probably the mip chain
   plus `flutter: 0.5` shear. Low priority, real.
6. Optional polish carried over: the near field at `hero_face` still leans a
   touch uniformly green for Leide. The lever is the `dry * 0.55` hue push in
   `GrassField._makeTile`, not the palette.

## 8. Gotchas and dead ends

- **`#include <project_vertex>` — do not consume it.** `VegMaterial.patchVeg`
  folds the sway into `transformed` inside `<begin_vertex>` precisely so it does
  not eat the `<project_vertex>` marker that `world/sky/MaterialPatch.ts`
  replaces to write `vAtmWorld`. Consume it and every leaf and grass card
  computes its eye distance as `length(cameraPosition)`, so all vegetation more
  than a kilometre from Hammerhead floods to 100% sky inscatter — flat
  blue-white cards over brown ground. The existing comment says all this; I left
  it intact and verified distant vegetation is clean on
  `tmp/shots/gr5/vista_noon.png` and `zone_three_valleys.png` after every shader
  edit. **Check those two shots after any change to `VegMaterial.ts`.**
- **GLSL reserved words cost me two full rounds.** A local in the vegetation
  shader may not be called `cross` or `patch` — both are reserved, and both fail
  as `'Illegal use of reserved word'` at *link* time behind the useless message
  `THREE.WebGLProgram: Shader Error 1282 - VALIDATE_STATUS false`. Now commented
  in place at `VegMaterial.ts`.
- **`shoot.mts --no-daemon` did not surface those shader errors; the daemon path
  did.** I could not reproduce them on the `--no-daemon` route at all. If you
  are hunting a shader bug, use the daemon, and get the *full* error text — the
  daemon's `/shots` response carries it but `shoot.mts` prints only
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
  mid-session. Name scratch files with your agent id. This session's live in
  `tmp/veg-a489/`: `probe2`-`probe7.mjs` (daemon `/eval` measurements),
  `windstrip.mjs`, `motionmap.mjs`.
- **A stale capture daemon from a dead worktree holds the port.** `shoot.mts`
  refuses to reuse it (correctly — it would capture the other checkout) and the
  error names the running root. `lsof -ti :5431 -sTCP:LISTEN | xargs kill`.
- **`import('three')` does not resolve inside a `/eval` body.** The page has no
  import map for the bare specifier. Grab the constructor off a live object
  instead: `g.scene.traverse(o => { if (o.isLight) CC = o.color.constructor; })`.
  App modules *do* resolve, by their served path — `import('/world/veg/Biomes.ts')`,
  **not** `/src/world/...`, because `src/` is vite's root.
- **`imgdiff.mts` and `crop.mts` decode PNG only.** Capture `--jpeg` for reading,
  PNG for measuring; do not mix them up and then debug the decoder.
- **`Trees.composeTint` caches on the identity of the biome's `treeTint` array.**
  That is safe *only* because `VEG_BIOME` holds module-level literals that are
  never mutated or blended per position. If anyone makes `vegAt` return a blended
  recipe, this cache silently serves the first blend to the whole world.

---

## 9. Cross-boundary items

- `src/world/veg/Ecology.ts:497-500` — `groundColor` delegates to
  `Terrain.groundColorAt` / `Terrain.colorAt`. This is the only coupling from
  vegetation into terrain colour, and it is read-only. `agent/splat` changing
  either function changes my grass. See §5.
- `src/world/terrain/**` `lowAlt` gate — reported by `agent/splat` as gating
  grass off above 120 m. **Not mine, not touched.** Visible in
  `tmp/shots/gr5/zone_three_valleys.png`.
- `src/tools/orphans.mts` now reports **no orphans** (272/272 reachable). The
  `MapRaster.ts` orphan noted here previously has been resolved by someone else.
- **`Terrain.groundColorAt` disagrees with the rendered ground.** At
  `zone_fallgrove` it returns linear lum 0.090 / r/g 1.34 — a warm brown — while
  the ground rendered in that frame is a pale, desaturated grey-green. Every
  vegetation tint bleeds `groundColorAt` at `GROUND_BLEED`, so the grass is being
  matched to a colour the terrain does not actually draw, and the field ends up
  reading as dark dots on a light mat. Owner: `src/world/terrain/**`. Either the
  sampler or the splat is wrong; I cannot tell which from this side.
- **The terrain paints a grass *mat* in its splat while `GrassField` places grass
  *instances*.** Nobody has tuned the two against each other. Density looks
  acceptable in `veg-final/poi_chocobo.jpg`; the mismatch that does show is one
  of *value*, not density, and it is the item above.
- The `lowAlt` gate in `src/world/terrain/**` still gates grass off above 120 m —
  visible as the bare highland in `veg-final/zone_three_valleys.jpg`. Not mine.
- `zone_ravatogh` frames a green forested valley rather than the volcano. The
  biome table asks for ash and dead wood there; the *shot* is standing outside
  the zone. `Shots.ts:391`, coordinator-owned. See `veg-zones/_sheet-1.jpg`.

---

## 10. Gate status

| gate | result |
|---|---|
| `npx vite build` | **PASS** (also enforced by the pre-commit hook on every commit) |
| `node src/tools/integration.mts` | **PASS** — 18 pass, 0 wired-but-unproven, 0 not integrated |
| `node src/tools/orphans.mts` | **PASS** — 272 modules, 272 reachable, no orphans |
| `node src/tools/shoot.mts` page errors | **0** across 24 shots (`veg-final`, `veg-zones`) |
| draw calls | 378-582 over the twelve-shot `veg-final` set, budget 800 |
| `node src/tools/perf.mts` | **not re-run this session.** Last figure is `vista_dawn` 39.1 fps under six-agent contention with no before-baseline. See §6 |
| `node src/tools/gameplay.mts` | **not run** |
