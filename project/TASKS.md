# Task list

**The backlog.** Measured, named, not done. One line each; the argument lives in
the named handoff under `archive/handoff/`. Delete a line when it is done or
stops being true.

Unlike a plan this file **may live forever** — it is a tracker, which
`docs/plans/README.md` says belongs in `project/`. Nothing here is committed to
and nobody is assigned. **A measured negative is not a task**; the archived
plan's negatives table is the list of things already decided against.

*Audited 2026-08-29 against all 26 archived handoffs and both archived plans.*

## Live defects nobody had recorded

- **Nothing in `check` fails when a bake artifact is missing.** `geo.bin.gz` was absent for a day (~1.2 s of cold boot) while five handoffs said "whoever is next should re-bake". `daemon --health` warns; no gate does.

## Memory — 1.5 GB the tab, 2.5 GB the tree

- **181 MB of render targets across 33** — the biggest remaining lever. `PostFX`. `memory-cut`
- **Nobody has looked at a 1.3 M-vertex town.** Eight POI compounds are 119.7 MB / 3.70 M resident vertices; `lestallum` 1.34 M + `galdin_quay` 1.28 M are 2.6 M of it and 254 ms of 417. Survived every cut this session. `geometry-bake`, plan A §WS-3
- `AttrPack` does not reach the 116 POI sites that stream in during play. `memory-cut`
- `skinWeight` is 20.4 MB of `4x Float32`; glTF ships `Uint8`. ~15 MB. `memory-cut`

## CPU and boot

- **`post.render` is 74–77% of the frame — the only idle-CPU lever left on a 60 Hz panel.** The 60 cap helps 120 Hz only. `runtime-facts`
- **85.5 MB on the wire on a first visit** — 0.3 s local, ~14 s on 50 Mbit. `runtime-facts`
- Boot blocks are still seconds: `Vegetation` 1.3 s, `Dungeons` 1.2 s, `Props` 1.2 s. Chunk inside the loops; `yieldToBrowser()` is exported for it. `runtime-facts`
- **`Props.landmarks` -> `bakedParts` is NOT a five-line addition** — refuted 2026-08-30, `lane13`. `bakedParts` skips `fill` on a hit, and `Landmarks.build`'s loop also assigns `runeMesh`, `flames`, `havenTop` and pushes every haven fire and lantern into `this.lights`: a hit ships havens with no fire and no light after dark. Making it cacheable means splitting placement from lofting across `Landmarks.ts`.
- `Vegetation.bushes.build` ~120 ms — untried; nobody has split geometry from instanced plumbing. `geometry-bake`
- **A `TileStream` primed-at-origin cache is one mechanism serving two items** — `Rocks` (~78 ms, two rootless streams) and `Vegetation.prime` (610 ms). Not geometry, so `bakedGeo`/`bakedParts` do not fit: it wants the per-tile instance matrices plus the streamer's tile bookkeeping. The restore side lands in `src/world/veg/`. `lane13`
- **Caching `Vegetation.prime`'s *result* (610 ms) is untried** — a different idea from deleting `prime`, which is a recorded negative. The streamer's tile bookkeeping must be restored with the matrices or the world desyncs on first `update()`. `geometry-bake`
- Character LOD: `town_forecourt` 465 calls / 5.33 M tris, one `SkinnedMesh` bucket at 60 calls / 1.74 M tris / 28 940 per draw. Headroom, not cost. `materials`
- `Wear.ts:873` keys its program cache on `tex.uuid` for GLSL that is byte-identical every time. 1–2 programs, free. `materials`
- ~17 dedupable programs in `characters/rig/` (`char2-eye<N>` — the splitter is the iris hex baked as a GLSL literal at `Materials.ts:369`; `gloss` is always 1.0). `materials`
- Water's reflection pass spends ~40 draws on shots with no visible water (`Water._visible` is a bbox test). `perf-r4`
- NPC eye globes + contact-shadow blobs, ~28 draws. The globes cannot merge — independent gaze pivots. `perf-r4`
- Wave 3's frame-cost split, pixel-scaled vs fixed. Recipe written, never run. `perf-r4`

## Sky, grade and light

- **`zone_vannath`'s foreground sits under a cloud shadow at luma 13/255.** `shadowScale` 3.5 maps a 9.45 km field onto a 2.7 km tile → ~640 m patches under 2.25 km clouds. **Do not take `shadowScale` to 1.0 alone** (one patch in the visible world) and **do not deepen it** — 26% of sunlit against a real 11%. `sky-clouds`
- **Cloud internal dynamic range — "the top of the next list".** Crown and self-shadowed base differ by well under a stop; no interior structure at 4×. Levers: `cloudDensity`'s remap steepness and `uCloudSunGain` against `uCloudMaxRad`. **Not** `uCloudTap`, **not** `MARCH_SCALE`, **not** exposure — all recorded negatives. `sky-clouds`
- **`hi(R−B)` −20.7 against the reference's −13.5**, `R−B` −17.9 against −8.5; both moved the wrong way. **Do not chase with a tint** — build a sky-matched reference slice first (our vistas are 40–60% sky against the plates' 20–25%). `sky-clouds`, `ground-light`

## Vegetation, alpha and occlusion

- **The tree impostor ring is 250–330 m** (`Trees.ts:507-509`; 210–280 was stale — 280 was the bush ring's former value, now 440) and holds the treeline's residual speckle. `leaftexel.mts` prints the texel band per shot. `alpha-edges-r2`
- **`coverageAA` is called only from `VegMaterial`** — fences, foliage decals, town alpha-cut props, `hh_town_chainlink` and every character hair card are still binary. One line each. `alpha-edges-r2`
- **Character hair is `mips: 0` on all four heads** — 128 px, anisotropy 16, no mip chain, 9.01 texels/px at 5.2 m. *(Unverified at HEAD by the audit — check before acting.)* `alpha-edges-r2`
- **Nothing with a silhouette occupies 15–97 m on `hero_full`.** The occupant exists, is instanced and in-frame: pull `scrub_*_card`'s seating range inward. No new asset, no new material; price the draws with `vegcensus.mts`. `alpha-edges-r2`
- **`aoBoost` reaches grass and nothing else** (`GrassField.ts:465/485/492`) — trees and bushes carry no base occlusion. Half of what WS-2d has left. `ground-r2`
- **`Rocks.ts` already writes a vertex colour from `up`/`cav`** that a height-above-own-base factor would ride for free — WS-2d's other half. `ground-r2`
- Terrain's **1–64 m occlusion band** is empty: detail maps own under a metre, the horizon bake is swept at a 64 m texel, nothing occludes at the scale of a swale. `ground-r2`
- **Coverage economics** — near ring is `spacing 0.27, max 240000`, `HALF_W = 0.046`; nothing buys width near the camera. **Reconcile explicitly with `grass.md` §3, which deliberately went the other way** (tuft radius 0.83× → 0.26–0.56×) and verified by eye. `ground-light`
- Bush stand-card vs its own geometry-ring albedo, via `bakeCanopyCard`. Extend `vegalbedo.mts` to bake the card. *(The three "unpinned cards" were a false alarm — a fern, a reed and a lily pad are three species, not three LODs.)* `ground-light`

## Terrain and water

- **The corduroy has two readings and whoever takes it needs both.** `terrain-r3`: the ensemble of five `ridged2` generators in one `strikeFrame`, closed with a price. `ground-r2`: a single candidate, `Field._addDetail`'s `gully` at a 139 m base wavelength, lacunarity 2.1, incising 4.8 m, amplified by `(0.4 + 0.9*slope)` so it bites the flanks — ~130 m pitch matches ten folds across 1200 m of ridge. **See `HUMAN_REVIEW.md` — this may be a funding decision, not a lane task.**
- **The shallow-reach river material — two lanes, two levers, both on the row.** `confluence`: it is `RiverMaterial` and depth. `water-fix`, looking at the same frames with the surface drawing for the first time: *"the lever is the channel — a reach on a flat pan has no banks to have water between — and conditioning the heightfield is a `Field.ts` job."*
- **The tarn surface reads as dense white foam mottle across the whole body** at `maidenwater`. `Water`/`Shore`, and *after* the foam-band fix (45.7% → 14.9%), so not that item. `poi-seat`
- The discharge proxy is **zero on 85.8% of stations**, so most of the network is the minimum channel. Lowering the 0.88 pivot retunes every river in the world. `confluence`
- More than two confluences is **bounded** for `River.ts` (40-point sweep, never more than one junction that widens even at 44 sources). Any further gain is the heightfield's drainage, and nobody has scoped or priced that. `confluence`
- `Water.surfaceAt` knows nothing about rivers and is a bbox scan; `Fishing` and `PoiKits._waterNear` hold their own copies. `WaterMask.levelAt` is the single answer — folding them in moves fishing survey results. `veg-water`
- `Bushes`' reed/lily lattice has the same 8 m interpolation problem grass had. `veg-water`
- `treeDensity` allows 30 cm of water, written for a coast. One number. `veg-water`
- **Malacchi Pond has no pond** — nearest water 133.5 m away, 28 m below. `poi-seat`
- Boulders under Crestholm outside `Ecology.rockScatter` — ~23 instances deeper than 1.2 m. `veg-water`

## Props and art

- **`gradePad` writes world-planar XZ UVs** (`Wear.ts`) — texture varies with radius, not height: **16:1 vertical stretch** on the cliff branch. This is the "smeared / pasted on" two reviews reported. Every apron. `poi-seat`
- **Fociaugh's cave mouth is buried under a POI apron** — a ~40 m untextured beige deck built on top of it, filling every approach frame from four vantages. A talus-ramp design that would be real collision floor is written in `e5557e5` and cannot land until the apron goes. `memory-content`
- **Balouve's sill is 15.1 m below the eye at 8 m and 36.7 m at 20 m** — worse than Fociaugh, never reported. Distinct from its 7.09 m apron hang. `memory-content`
- The Tomb of the Mystic's mausoleum may be broken as well as steep — the pediment appears to hover on column stubs. `_tomb` snaps ~16% of columns deliberately, so *probably* the authored ruin. Seen twice. `poi-seat`

## Characters

- **Every painted brush and painted AO on the head was authored while the face was culled** — tuned against the inside of a skull. Pass 6 softened 30–45%; the frame says not nearly enough. Consider re-authoring.
- The hair covers most of the far eye (`len`, not direction) and reads as flat ribbons at 0.55 m. The arithmetic was never acted on: a 1.5 mm lock at 4 m is **0.7 px**.
- **A dark diagonal still crosses the shadow half of the mid-face** — the eye-socket brush wall at a third of its size. Another 20–25% is available but starts to close the aperture. `head-r6`
- **The eyes are asymmetric in a bald front framing** — one reads narrower at the same `eyeOpen`. Uninvestigated. `head-r6`
- **`facewind`'s negative signed volume on `Noctis_body`, `_hair`, `_outfit` and both eye meshes is unchecked.** Two passes estimated ten minutes; neither spent them. This class of bug beat five passes.
- `euEu` **162.5 mm** against a real 152 — the lower face is heavy for a slim twenty-year-old.
- Ignis is untouched — one black column, no hem line, lapel thickness or collar break.
- The sleeve cut: real work on `piece('sleeve')`. Three attempts at it as a *surface* are a recorded negative.
- Noctis's skull print is vertex-coloured on a 42×76 shirt sweep and smears at 0.95 m; a hole at his collar; `_palm*` framings are inside the geometry and nothing has ever looked at a palm.

## Creatures and combat

- **`RpgSystem.enemyScaling` is documented as reading the party's level and does not** — `RpgSystem.ts:721` is `nightScaling(hour, isDaemon)`. `EncounterDirector.activate` feeds its `levelBonus` into every authored territory. `creatures`
- **A field encounter lasts 6–7 s against FFXV's 30–90**, and the level curve is spent (1.0 is the ceiling; 30 s needs ~21 000 hp of den against a top species of 22 000). The two untouched, never-measured levers: **pack size** (`WildTerritories.count`, `Pack.maxEngaged`, `spawnRoamer` caps at 3) and **warp-strike throughput** (26–47% of a den's damage from 3–12 casts). `combat`, `creatures`
- **The goblin is 24.5% of its vertices under 0.4% linear reflectance** (`SKIN_DARK = 0x191220`, ~0.7% linear) — the daemon-albedo pass that lifted seven species skipped it. `bestiary_goblin` is a corpus shot, so it wants its own round. `creatures`
- Anak: horns read as flat reeds edge-on (amplitude exhausted at 26 steps; widen the `flat` ratio), the face is paler than the neck and the join shows, and the `idle` grazing phase decides whether you photograph a neck or a face. `creatures`
- The deposit residuals: the rock socket disappears on pale ground (tint from `terrain.groundColorAt`, not a fixed `0x8a7a68`); `siteNear`'s 14–34 m ring is narrower than Hammerhead's apron, so one deposit stands on graded asphalt (reject on `sampleMaterial`'s road/pad terms); **no deposit has a `Shots.ts` entry**, so none is in the corpus. `memory-content`

## Harness and housekeeping

- **`assertAttributeContract` is not wired into a generator** — only gated in `geocheck` over the bestiary. The last unwired row; `assertUpward`, `assertCardOrientation` and `assertConsistentWinding` are all wired. `harness`
- **Grep for unguarded `normalize(` and `pow(` with a varying base in the remaining shaders.** `canopy` cleared only what `nanscan` pointed at, and both NaN bugs were an operation undefined on its input reaching the frame through a path that looked safe. `canopy`
- Two menu nits the scrim blur revealed: the Armiger gauge caption is dark-on-dark and wraps to *"on a / pad."*, and the two-column screens leave the bottom ~35% empty. `harness`
- `project/noise-floors.json` covers 20 shots of 142 (4 of them above the default); the rest diff against a placeholder `DEFAULT_LIMIT = 2.0`, and the recorded floors are *cold* while the daemon reuses pages, so a warm diff runs 4–6× them. plan A
- `project/archive/handoff/` is at 90 files and nothing prunes it.

## Memory: what lane 13 measured and could not reach (2026-08-30)

*Lane 13 landed `AttrPack` rules for `skinWeight`/`aMat`/`aTan`/`aGroom`/`aClip`
and half precision for over-bright vertex colour — Float32 attribute bytes
204.6 -> 139.6 MB, a deterministic -42.1 MB CPU and the same again GPU-side.
The exit (tab under 800 MB) did not close, and the gap is not where the plan
said it was: the tab is **1 382 MB**, not 1 246, and everything plan tasks
38-41 name is worth ~15 MB against a 582 MB gap.*

- **213.5 MB of CPU geometry is disposable and `bootprof` says it is not.**
  `BufferAttribute.onUpload` nulls the array after upload. The safe subset is
  the shadow proxies — the census proved they are `[position:Float32]`,
  depth-only, never raycast — ~32 MB. `lane13`
- **The bake path costs ~270 MB of tab RSS and the containers are not the
  reason** — `GeoBake` releases its body, `TexBake` compacts to 7.1 MB
  (`_probe/bakeresident.mts`). What is left is peak transient: every loader
  does `new Uint8Array(await new Response(body).arrayBuffer())` over a
  `DecompressionStream`, ~2x the inflated size, for 165 + 67.3 + 67.1 MB plus
  the heightfield. Put the inflated length in each `.json` sidecar and fill one
  pre-sized buffer. `GeoBake.ts`/`TexBake.ts`, lane 14. `lane13`
- **Half of each town is its shadow proxy, and it carries position only.**
  `lestallum/town_shadow` 666 839 verts / 11.1 MB and `galdin_quay/town_shadow`
  637 163 / 10.6 are 1.30 M of the towns' 2.61 M vertices. Nothing to strip;
  decimating a proxy a shadow cascade cannot resolve is worth ~16 MB.
  `PoiKits.ts`, lanes 18/19. `src/tools/_probe/towncensus.mts`. `lane13`
- **~190 k of 1.63 M town triangles are sealed under 2 m and face down** — 6-7%
  in the two towns, ~20% in the six imperial camps: the bottom faces of the
  kit's closed box lofts. NOT the same as the blunt 26.6% downward-facing
  figure, which includes canopy soffits. `lane13`
- **`position` is 78.6 MB, 71.1 of it inside Int16**, but a normalised integer
  position needs a per-geometry scale and offset pushed onto the mesh, and these
  geometries are merged, shared and read back by collision. Its own change, its
  own risk. `AttrPack.ts`. `lane13`
- **`uv` is 30.2 MB and has no safe cheaper format** — span [-17.84, 35.04]
  rules out both normalised integers and half precision. Would need a
  per-geometry uv scale. `lane13`
- **No boot, memory or cold-load number taken on 2026-08-30 is a baseline.**
  Every arm printed `CONTENDED throughout` with eight lanes live, and the same
  build read 1 211 and 1 280 MB five minutes apart — a 69 MB spread larger than
  most of what a lane can cut. `geo.bin.gz` and `texc.bin.gz` were absent for
  hours, pruned repeatedly by co-agents' `pre-commit` `vite build`. Re-measure
  on a quiet tree with the caches rebuilt. `lane13`
- **`ShopScreen` has no per-shop sell multiplier.** `TOWN_SHOPS.pearl` wants
  `sellMult: 1.4` honoured in `rows()` and `accept()`, so Coctura buying the
  catch over the odds is a property of the counter rather than of a dialogue
  branch. Not blocking: the 40% is paid today from `NpcDialogue.coctura`,
  through `Inventory.sell` at the normal rate plus a separate credit, so the
  ledger and the `gil-changed` events stay honest. `ShopScreen.ts`, lane 10.
  `lane19`
- **`PhotoScreen.subjects()` can only emit `meteor`, `beast`, `party`,
  `vista`**, so a `photo` objective can never name a *place*. Both cities now
  have authored photo spots (Galdin's causeway and Angelgard, Lestallum's
  lookout) and only the Lestallum one is distinguishable, because the Meteor
  happens to be a subject. A `landmark:<poiId>` subject keyed off the same
  `facing()` test the Meteor uses is about fifteen lines. `PhotoScreen.ts`.
  `lane19`
- **Lestallum's street grid leans into its own market square.** Measured with
  `src/tools/probes/cityanchors.mts`: a `render4`/`stone` block stands within
  2 m of `edge0`, `edge1`, `edge5` and `stall5`, so four of the nineteen
  anchors `_town` publishes are unusable there and every placement in
  `CityHub.CITIES` and `Npcs.CITY` routes around them. The fix is in
  `PoiKits._town`'s block loop — skip a block whose jittered centre lands
  within ~15 m of the origin — and it would give both cities four more
  usable anchors. Re-run the probe after any change to `_town`. `lane19`
- **The baked layer-texel cache is SHARED across build trees, so a `Layers.ts`
  A/B by sha measures whichever tree booted last.** `src/public/baked/` is
  symlinked into every materialised `sha:` tree, and `vite-plugin-bake` re-checks
  its content hash only in `configResolved` — at server start. Two trees alive at
  once with different `Layers.ts` therefore fight over one stamp file, and a page
  already booted keeps the texels it built. Measured on 2026-08-30: a clean
  `--build <parent>` vs `--build <child>` pair around commit `444a988` came back
  **byte-for-byte identical on every huestat column**, because the shared bake had
  been regenerated from the child tree between the two captures. The `--dirty`
  path is worse and has no symptom at all: the daemon keeps one long-lived dirty
  server, so a recipe edit made *after* that server started is served from the
  stale cache — and the frame that looked like a large win from it turned out to
  be another lane's in-flight edit arriving through the same shared tree. Either
  key the bake directory by source hash rather than by repo, or have the runtime
  verify the stamp it loads. `src/tools/vite-plugin-bake.mts`, `src/tools/bake.mts`.
  `lane5`
- **Props, rocks and characters do not get the terrain's new sky fill.** `lane5`
  added `uSkyFill` in `TerrainMaterial.ts` — a terrain-local second helping of the
  `SkyProbe` irradiance, gain 3.5 — because the probe delivers only ~6/255 to
  shadowed ground and terrain then occludes it twice. Everything else in the scene
  still gets the single helping, so a boulder standing on lifted ground is now
  relatively darker in shadow than the ground it sits on. Nothing in a frame looks
  wrong today, but the honest home for this is `sky/MaterialPatch.ts`, which
  already patches every opaque material and could carry the same term for all of
  them. `lane4`/`lane5`
- **GTAO costs 5/255 in `zone_vannath`'s shadowed foreground.** Measured: the
  foreground box reads Y p50 11 shipped and 16 under `?post=nogtao`, on top of a
  cloud shadow that costs 21. GTAO is `postfx/`, not terrain, and its radius is
  0.62 m — a metre-scale occluder should not be removing a fifth of the light from
  a flat prairie 40 m away. Worth a look from the post lane. `lane15`
- **Cloud shadows are 3.5x smaller than the clouds that cast them, by
  construction.** Plan item 21's second half ("patches within 2x of their
  clouds") has an exact cause, and it is not a tuning drift: `Clouds.ts:414`
  bakes the shadow map by evaluating the cloud field over
  `uShadowTile * uShadowFieldScale` metres, while `sky/MaterialPatch.ts:120`
  samples it as if it spanned `uShadowTile` alone. `uShadowFieldScale` is written
  per weather from the preset's `shadowScale` (`Sky.ts:1376`) — clear **3.5**,
  overcast 5.0, storm 7.0 — so a clear-sky ground patch is exactly 1/3.5 of the
  cloud feature above it, and the bake's own comment says this is deliberate
  ("magnify it so several shadow patches fit inside the playable world instead of
  one giant blob"). Getting inside 2x is therefore a *two*-number change, not one:
  `shadowScale` down to ~2.0 alone leaves only two patches per the 2700 m
  `RepeatWrapping` tile and the repeat becomes the new defect, so `uShadowTile`
  has to rise with it (5400 m at 512 texels is 10.5 m/texel). Wants a capture pass
  of its own across `clear`/`overcast`/`storm`. `Sky.ts:318/330/853`, `lane4`
- **`zone_vannath`'s shadow floor is now sky-limited, not cloud-limited, and the
  cloud strength is defensible.** Measured on the same 288x162 foreground box:
  shipped 7/255, `?post=nocloudshadow` 28, `?post=noambient` 1. The extinction
  ratio that implies (sky = 21 % of unshadowed) is close to the real clear-sky
  diffuse fraction, so weakening `cloudShadow` 0.78 would be physically wrong;
  the fix was the sky term, which `uSkyFill` now lifts the box to 22. Reaching the
  plan's >=30 on THAT box needs one of the other two contributors as well — GTAO
  (5/255, see above) or a broader exposure decision. The plan's own named gate box
  (`0.33 0.62 0.46 0.78`) passes at **61** against its bar of 30. `lane5`

## Clouds: what lane 4 left behind (2026-08-30)

*All three of lane 4's tasks landed. `cStops` 1.49 -> 1.95 with clip 19.2% ->
6.6%; the top-edge crossing 8 -> 6 px; coverage cells 10 -> 51. It also found
two instruments lying, which is the more useful half.*

- **Cloud comb teeth on the mid-distance deck** (pre-existing, worse at dusk;
  present at `7da60d5`, so lane 4 did not cause it). `Clouds.ts:186-215`: the
  empty-space probe advances `coarse = 2*fine` with
  `fine = clamp(t*0.017, 30, 440)`, so the skip window is 880 m at range against
  shape features of 100-260 m. The 440 cap is what binds; lowering it costs fill
  and needs a quiet tree for an honest perf number. `lane4`
- **`cloudstat.mts` cannot grade storm, overcast or fog at all** — it needs a
  chroma-independent mask first. It reads cov 5.4% vs 94.5% on equivalent
  frames once the sky desaturates. `lane4`
- **`cloudstat.mts`'s `aVar` is dominated by component merging and `cStops` by
  component population**; both need a watershed split before either is a target.
  `lane4`
- **`uCloudTap` 0.00 is measured better than the shipped 0.50** on rampT (5 px)
  and edgestat hard (1.4%), at the cost of a faint half-res texel step at 4x.
  The next stop if a judged round still says the cloud mass reads defocused.
  `lane4`
- **The plan's `node src/tools/probes/nanscan.mts` command line is wrong**
  repo-wide: nanscan is a probe *body* and needs
  `node src/tools/probe.mts probes/nanscan.mts`. `lane4`

## UI and input: what lane 10 left behind (2026-08-31)

*Lane 10 closed all four of its items. The steering-sign gap is closed by
`b0da426`, which falsifies itself: `steerfalsify.mts` negates `c.steer` -- the
shipped bug exactly -- and the gate flips from PASS to FAIL. The `KeyT` double
binding is closed by `5be914f`. Both lines above are deleted rather than ticked.*

- **`CombatSystem._readInput`'s comment claims "gamepad face buttons mirror the
  keyboard verbs one for one"** -- Point Warp, heavy attack and the firearm have
  **no** pad binding at all. Bind them or soften the comment; 17 of the controls
  card's 44 rows print a dash for exactly this reason. `lane10`
- **Five menu screens sit 29-54% empty below their last line, measured.**
  elemancy 54 · inventory 49 · system 40 · photo 38 · quests 35 · armiger 29,
  rest under 8%. `src/tools/_probe/menufill.mts` measures lowest *ink* in the
  reading band and is the before/after for anyone who takes them. **Lane 12
  candidate** -- deliberately not acted on, because five screens' layout is not
  lane 10 and plan rule 1 says no section may grow. Note the instrument's own
  first version said 0-6% for all sixteen screens, because it counted any
  painted box and the plates and Armiger divider run the full band height.
  `lane10`
- **`ui-shoot.mts` has no `--jpeg` flag** -- it prints `unknown scene --jpeg`
  and writes PNGs regardless, though several briefs' command lines offer one.
  A trap for any lane that follows its brief literally. `lane10`
- **An untracked `shots/` directory appeared at the repo root** and `pre-commit`
  flags it as off-roster. `tmp/shots/` is the default `--out`; something wrote
  a full corpus to the root instead. Delete it once no lane is live. `lane10`


## Spine, dungeons and wayfinding: what lane 17 left behind (2026-08-31)

*Lane 17 closed all eight of its Part D items (49–56). Chapter 3's soft-lock is
gone (`ff695f8`) and the `mainchain` shim that false-passed it is deleted in the
same commit; dungeons spawn their authored fights (`427e68b`); the POI `gate`
field is gone (`1e2a1e4`); the spawn haven is real (`fe273b4`); the map can send
Ignis somewhere (`7e355e3`); the chart survives a reload (`1c3754b`). Item 51 is
a measured negative and is the first line below.*

- **Chapters 2 and 4 are the short half of the spine.** `probes/spinetime.mts`
  prices the main line at **46.3 guided minutes** against Part D's 50–65 target:
  ch1 14.0 · ch2 **4.9** · ch3 17.2 · ch4 **3.8** · ch5 6.6 (17.7 min of it real
  road-graph travel, 28.6 min of stated act allowances). Chapters 1 and 3 are on
  brief; 2 and 4 are three objectives of drive–talk–do with nothing between them.
  The fix is content in `Quests.ts`, which lane 17 released to lanes 18/19/22 at
  `ff695f8` rather than grabbing back — two or three acts each, ideally routed
  through the new Galdin and Lestallum hubs. `lane17`
- **The dungeon map screen is still unwired.** `DungeonMap` now draws enemy pips
  for fights that genuinely exist, and nothing opens the screen. Named in Part D
  item 52 as deferred. `lane17`
- **`integration` is 26 pass · 1 not integrated on `gald_ferrybell->npc_navyth`**
  — "walking up to a thing selects that thing", 1/65 unreachable. A Galdin Quay
  interactable collision; not lane 17's files. `lane17`
- **Three Keycatrich POIs share one road node**, so `roadGraph.route` between
  `keycatrich_trench`, `keycatrich_ruins` and `tomb_wise` returns **length 0** —
  a 147 m leg priced as free. `spinetime` floors road distance at the straight
  line to work around it, but the graph still reports it, and anything else that
  prices a journey (the map card's BY ROAD row included) will believe it.
  `lane17`
- **The haven rock's position is duplicated, not derived.**
  `Ecology._layoutSites` calls `_findFlat(-62,-46,40,9)`, which resolves to
  (-31.4, -20.3), and the new `spawn_haven` POI hard-codes (-31,-20). If that
  search ever moves, the pin does not and the haven becomes uncampable. Same
  coupling the Hammerhead pin already carries a comment about. `lane17`
