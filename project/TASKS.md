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

## Characters: what lane 1 left behind (2026-08-31)

*Lane 1 fixed the winding at its root and proved it with two orientation-absolute
probes across all four heroes -- every primitive INWARD -> OK, the hair shell
0.3% -> 99.7% outward, all four heroes' body/head/hair/outfit/shadow/both eyes
at positive signed volume. Tasks 4, 5, 47 and the new googly-eye defect are LIVE
with the respawned lane, not backlog, and are deliberately not listed here.*

- **~~Re-derive `Anatomy.drape()` against arc length~~ -- MEASURED FALSE, and
  both halves of the original claim were wrong.** three.js maps a Catmull-Rom's
  `t` **linearly to point index** whatever the curve type; `centripetal` only
  changes tangent weights *inside* a segment. Garment `t` and body `u` already
  agree at every node, so there is nothing to re-derive. And **Gladiolus' "bare
  mid-back" is his bare arm** -- framed at 2.2 m it resolves into
  deltoid-to-fingers skin (`sleeve u1: 0.40` and no shirt, both authored). At
  party range a bare arm across a black torso reads exactly like a hole in the
  torso, which is how it fooled two lanes. `lane2`
- **What IS real is the skin weights**: the body eases once through `weightsAt`,
  a garment eases twice, at two knot spacings. `DRAPE_DU = 0.030` makes the
  error small; only taking the weights from the body's own node knots makes it
  zero, and that needs `sweepTube` to accept a weight function rather than
  reading `weightsAt` off its own node list. `Geo.ts`, cross-lane. `lane2`
- **`enemies/RigBuilder.ts:85,118,170` -- `skinWeight` -> Uint8.** The last third
  of lane 13's task 38; `rig/Geo.ts` and `rig/Sculpt.ts` are done. Safe as it is
  (enemies merge only with enemies) but unoptimised. **Read the landmine first:**
  a post-hoc re-pack deleted an NPC's shadow because `mergeGeometries` saw
  `Uint8` beside `Float32`. Generator-side only. `lane1`/`lane13`
- **`src/tools/probes/skinclip.mts` -- read its median, not its worst.** Its
  nearest-vertex signed-distance form is unreliable and says so in the file: a
  garment is layered shells, and the nearest cloth vertex to a skin vertex is
  often on an inner face whose normal points back at the body, which reports
  "outside" for a body that is properly covered. `lane1`


## Lane 3 residue (2026-08-31, near-field and composition)

- **The near 0-12 m band has no vegetation LOD that reads from above.** The clump
  card is three crossed *vertical* quads each painting a whole tuft, so a camera
  two metres up sees a six-armed asterisk — the star tufts at the party's feet.
  `cd1c1fb` moves the card ring out to ~7 m, which fixes `hero_full` and costs
  `party_walk` most of the tussocks around the party's boots (isolated on an
  ablation tree: **9.517/255 over 22.2% of pixels, floor 1.51**). The blade ring
  cannot take over: on `hero_full` at HEAD `--hide grass_blade` moves 1.075/255
  over 2.68% against `--hide grass_clump`'s 16.734 over 35.3%, and its ring cap
  is 240 000 instances. The fix is either real tuft geometry inside 12 m or a
  near card whose planes are tilted/topped so its silhouette from above is not
  radial. Both touch geometry the silhouette and geo baselines key on. `veg`
- **`grass_sward` casts nothing you can see in Leide** — `--hide grass_sward` on
  `hero_full` is **0.188/255 over 0.80% of pixels**, under the 2.25 floor. The
  caster gate `hTuft > 0.16 * lod.hMul` is an absolute metre threshold despite a
  comment claiming it scales with the zone, and Leide's mean tuft is 0.138 m — so
  only the top ~35% cast. **Raising it is a recorded negative**: there is nothing
  there to raise. `veg`
- **Foreground occluders on the judged vistas (plan item 13) are one third done.**
  `vista_dawn` has one now (a branch across the bottom-left corner); `vista_night`
  and `zone_vesperpool` already had one; the rest do not. The recipe is
  `vista_dawn`'s own — place the camera against an existing world tree, do not
  author a prop — and it needs `Shots.ts`, which lane 3 released at `e5db679`.
  `shots`
- **Camera clearance does not put grass in a vista's bottom third — closed
  negative.** Twenty candidates over five shots at 5-20 m of clearance against
  baselines of 22.9-50 m, read by two independent look-loops: individual grass
  blades appear in the bottom third of none of them. Do not re-open it as a
  framing question; it is a near-field density question. `shots`, `veg`
- **`zone_longwythe`'s framing is contested, not settled.** One look-loop scored
  7 m of clearance 4/5 against the 35 m baseline's 3/5 for the foreground rock
  stack it promotes; the other kept the baseline for the layered ridges, the
  meteor, the skyline and the rest stop. Left at baseline. A judged round should
  settle it rather than another agent's eye. `shots`

- **The d16/d32 relief deficit is tier-C's, not tier-B's, and it is still open.**
  Measured 2026-08-31: ours `longwythe` d16 15.58 / d32 19.23 against
  `FFXV-ground` 21.42 / 23.60, total 38.01 vs 51.10. Tier-B (30-300 m world)
  is off the top of `reliefstat`'s pixel pyramid and moved it 0.5-6% of the gap.
  16-32 px at 200-400 m is ~2-8 m of world, which is tier-C's band. Anyone taking
  this must first convert the spec into the instrument's units — see the
  LANDMINES entry. `lane5`


## From lane 16 (gates), 2026-08-31

- **The `prewarm` queue is not superseding, and it is why nothing gets a page
  tonight.** `daemon.mts`'s `prewarm()` docstring says "newest sha wins — a
  second commit supersedes the first rather than queueing two boots". The code
  did not: `prewarming` is set at submit and cleared in the job's `finally`, so
  it only ever rejected a duplicate request for the *same* sha, while a request
  for a new sha queued a second boot behind the first. With eight lanes and a
  `post-commit` hook firing one per commit, the queue grows faster than four
  workers drain it. Measured at 01:0x: **sweep depth 55, of which 54 were
  prewarm**, `queuedSec 86663` against `ranSec 16072` (84% queue), RSS 10.2 GB,
  and `preparePage` timing out at 300 s — which killed both arms of lane 16's
  driftcheck A/B and, per lane 1's commit message, its `--dirty` ablation too.
  **Fixed in `src/tools/daemon.mts` (supersede at the front of the queue), but
  the RUNNING daemon still has the old code.** It needs `node
  src/tools/daemon.mts --stop`; the next tool call restarts it with the fix and
  the 54 stale prewarms go with it. That closes every leased page, so it is the
  coordinator's call, not a lane's. `harness`
- **The shared bake cache is whatever sha was materialised last, not HEAD.**
  `bakecheck.mts`'s first run found `terrain.bin.gz` stamped from `c898bb4e`'s
  sources and `tex.bin.gz` from `3187d788`'s while HEAD was `4a6c840`
  (`src/tools/_probe/bakeorigin.mts` names the commit). `src/public/baked/` is
  symlinked into every materialised tree, so each `--build <sha>` build re-bakes
  the SHARED artifacts from that sha's sources. Every lane is capturing against
  some other lane's terrain. Not fixable without per-branch bakes (33 MB and
  ~40 s each); made honest instead — `announceBuild` now warns on any `--build
  <ref>` whose bake is not that tree's. `harness`
- **`texc.bin.gz` and `geo.bin.gz` have been absent all night**, ~3.7 s of cold
  boot per load, and every boot number and first-load figure taken tonight was
  taken without them. `pnpm run build:full` before the final measurements.
  `bakecheck` is red until then, which is the gate working. `harness`

### NaN sweep (plan task 48) — `node src/tools/nansweep.mts`

113 unguarded GLSL call sites, 9 HIGH. Triaged by hand; two of the three
`normalize(cross(...))` hits are false positives (the anti-parallel ternary
idiom, documented in the tool). **Seven real ones, and six of them are the same
shape**: a gaussian written `exp(-pow(x, 2.0))` where `x` is a *difference*.
`pow(x, y)` is undefined for `x < 0` in every GLSL spec, **for every exponent,
integral or not** — this is precisely the trail-ribbon `pow(vUv.x, k)` bug in a
costume that reads as "squared". The fix is `x * x`, which is defined everywhere
and cheaper. Drivers commonly return the right answer anyway, which is why
`nanscan` reports 0 of 142 shots and why this is a latent defect rather than a
visible one.

| file:line | expression | owner |
|---|---|---|
| `src/engine/postfx/SsrPass.ts:75` | `vec3 N = normalize(cross(dy, dx));` — `dx`/`dy` are depth-reconstructed world deltas; on a depth plateau or at a range where two adjacent texels resolve to one world point they are parallel or zero, `cross` is `vec3(0)`, and `normalize` is `0/0`. **The two guards below it do not catch it**: `N.y < 0.0` and `N.y < 0.86` are both FALSE for NaN, so the pass falls through and reflects using a NaN normal, in a post pass, where it smears. This is the one worth fixing first. | postfx |
| `src/world/terrain/TerrainMaterial.ts:1837` | `exp(-pow((la - 1.85) / 0.75, 2.0))` | terrain |
| `src/world/terrain/TerrainMaterial.ts:1877` | `exp(-pow((abs(roadLat) - 1.85) / 0.70, 2.0))` | terrain |
| `src/world/weather/Rain.ts:210` | `exp(-pow((r - 0.82) / (0.16 + 0.22 * vLife), 2.0))` — `r = length(vUv*2-1)`, so the base is negative over most of the quad | weather |
| `src/engine/postfx/BloomPass.ts:299` | `exp(-pow((r - 0.055) * 50.0, 2.0))` | postfx |
| `src/characters/rig/Materials.ts:374` | `exp(-pow((q - 0.30) / 0.10, 2.0))` | characters |

Checked and **safe**, recorded so nobody re-triages them: `VolumePass.ts:132`'s
`pow(1.0 + g*g - 2*g*cosT, 1.5)` has a minimum of `(1-g)^2 = 0.1444` at `g =
0.62`; `CrystalShards.ts:280-284` and `sky.glsl.ts:116-117` both guard their
cross with the anti-parallel ternary; every `pow(1.0 - clamp(...), k)` Fresnel
term is in `[0,1]` by construction.

## Water and weather: what lane 7 left behind (2026-08-31)

- **A rain splash cannot land on a prop.** `weather/Rain.ts`'s splash vertex
  shader finds the ground with `tf_height`, which is the terrain heightfield and
  knows nothing about the road, the apron or the Hammerhead forecourt slab. A
  splash under a prop sits at terrain height and is correctly depth-rejected by
  the prop above it — and the judged `storm` frame is mostly tarmac, so the one
  place the tell is judged is the one place the splash cannot appear. The fix is
  a depth-buffer read in the splash pass (project the instance to screen, sample
  the scene depth, place the ring at *that* height), not a bigger extent. Lane 7
  raised extent 22→64 m and the fade to the last fifth, which fixes the terrain
  case and leaves this one open.
- **A probe that poses with `rig.setShot` and screenshots returns a black
  frame.** Four of them, `tmp/shots/l7/p1/*.jpg`, on a build whose `shoot.mts`
  frames at the same sha were correct. `framecam.mts` works, because it injects
  the spec into `SHOTS`, calls `applyShot` twice around a `settle` and
  screenshots after that. Either `probe.mts --shot` should be documented as
  unusable for framing or it should adopt framecam's path; as it stands
  `probes/vegwaterlook.mts`'s whole look-loop is presumably producing black
  frames too and nobody has said so.
- **The corpus has no shot of a tarn, a river, a shoreline at eye height, or
  rain on the ground.** Lane 7 derived and shot five candidates —
  `tmp/l7/frames.json` and `src/tools/probes/l7frames.mts` (which derives its
  own from `Water.bodies` and `Water.riverJoins` and hands them back to
  framecam). `surf`, `maidenwater`, `vesper_low` and `storm_ground` are all
  frames that show a defect no judged shot can reach. **For lane 21.**
- **The near field of a lake reads as bright speckle under overcast.** At 10–60 m
  the wave normal is rough enough that Fresnel picks up the bright overcast sky
  on scattered facets and the surface fizzes. `calmFar` correctly leaves the near
  field alone, so this is an amplitude question at close range and wants a
  measured answer, not a tweak. `tmp/shots/l7/f2/vesper_low.jpg`.
- **`Water._visible` is a bbox test and the reflection pass spends ~40 draws on
  shots with no visible water** — already demoted in this file, not touched, and
  lane 7's work did not make it free.

- **`reliefstat --against` is now a hard error, so two documented command lines
  need editing.** The flag was never read (the reference is unconditionally the
  six `GROUND_PLATES`); after `1f799ae` fixed the crash it was accepted and
  silently ignored, which is worse. It now rejects. The two call sites are
  `docs/plans/2026-08-30-fable-to-nine.md:1246` and
  `project/handoff/lane5-terrain-light.md:137`; both are proposed next steps
  under an explicit "Not verified", so **no measurement in this repo rested on
  it** (grepped). Drop the flag from both lines when you next touch them.
  `harness`, `lane5`

## Post-processing and RT budget: what lane 15 left behind (2026-08-31)

*Both of lane 15's plan exits closed as measured negatives and are in
`HUMAN_REVIEW.md` as quality calls. Grain on flat sky (task 27) landed and is
verified: high-frequency energy in a box of clear blue at `vista_noon` falls
2.53 -> 1.14/255, -55%, with `?post=noskygrain` as the control.*

- **MSAA sample count is the only remaining RT lever**, and `sceneSamples()` is
  coupled to `VegMaterial.patchVeg` in another lane's file. Needs a cross-file
  owner. `rtScene`'s multisample renderbuffers are **65.92 MB at samples 4 and
  131.86 at ultra's samples 8**, x2.25 at dpr 1.5 — that one line is the 69 MB
  gap between the declared and resident RT walk. `lane15`
- **`gtao.normalRenderTarget` is 21.97 MB declared and 0 resident** — never
  uploaded. A 1x1 stub deletes it outright. The only free deletion in the walk;
  SMAA's two buffers read *resident* and are not. `lane15`
- **`bootprof.mts:76-89` still feeds `docs/BOOT_PERF.md` a wrong formula** — its
  `sizeOfRt` ignores `samples`, assumes 4 channels at the colour type, and prices
  depth at 1.25x. The honest walk is in `rtwalk`. `lane15`
- **`glDrawArrays: Feedback loop formed between Framebuffer and active Texture`
  floods `perfpasses` until chromium stops reporting.** Undiagnosed, no owner.
  `lane15`
- **`rtVel` -> RGFormat is refused, with a reason:** alpha is the "a mover drew
  here" flag and both consumers branch on it. Not a saving. `lane15`


### Lane 7 addendum (2026-08-31): the waterline blocks

- **Evenly spaced rectangular slabs lie along every sea waterline**, at a ~4 m
  pitch, reading as if they sit slightly above the water, with a matching
  rectangular light/dark patchwork in the shallows inboard of them. Read
  `tmp/shots/l7/f4/l7-body1-sea.jpg`. Never seen before because every corpus
  shoreline is 250 m+ from camera; found by the first bank-height frame of a sea
  body. **Disproved cause:** it is not a contour of the bilinear bed in the
  water alpha — breaking that threshold up with the foam's own `churn` noise
  (`cf41e2f`) left the frame visibly unchanged against `9f5dd37`. **Ablate in
  this order:** `water/Shore.ts`'s 21-row swash ribbon (`shoot.mts --hide`),
  then the terrain clipmap's LOD stitching. Lane 7 owns the first one.

### Lane 23 addendum (2026-08-31): swimming and diving residue

- **A swimmer plays a walk cycle.** `Player.update` calls `character.update({
  speed: this._gait, ... })` inside its own `update`, before any `lateUpdate`
  the swim lane runs, so there is no zero-edit way to give a swimmer a stroke.
  The real fix is a swim action in the rig — `src/characters/`, so **lanes
  1/2/22**. Two partial zero-edit levers are written up in
  `project/handoff/lane23-swimming.md` ("The biggest remaining visual gap"):
  pitching `player.root` forward from `lateUpdate` the way `Occupants` does for
  seated poses, and holding the gait near idle through
  `CharacterController._score`. Neither is landed; neither has been looked at.
  `lane1` `lane22`
- **Two underwater framings want to be in the corpus.** `under_alstor` and
  `under_vesper` — the first views of the water shader from underneath that
  anyone has taken, and the only framings that exercise the new
  `uCameraPos.y < uLevel` branch in `Water.ts`. Derived live by
  `src/tools/probes/nanunder.mts`; resolved values in the lane 23 handoff.
  `lane21`
- **`Water.riverJoins` comes back empty — diagnosed, not a confirmed bug.**
  `River.ts:778` skips any reach with `trunkOf[a] < 0`, and a reach only gets a
  trunk if its first half passes within `hw[i] + th[bj]` of an already-accepted
  reach (`:571-583`) *and* does not land in the last `minJoinRun ?? 90` m of it
  (`:594` — "two reaches meeting end to end at the sea is not a confluence").
  With nine reaches all running to the same sea, all nine landing in that
  end-of-trunk window is entirely plausible. **`stats.confluences` settles it in
  one probe line**: 0 means the routing genuinely found none and there is
  nothing to fix; > 0 with an empty `joins` is a real bug. `lane7`
- ~~Does any corpus shot now stand in >1.2 m of water?~~ **ANSWERED, CLEAN.**
  `src/tools/probes/shotswim.mts` at `4af4d26`: `0 of 162 shots stand in water;
  0 engage the swim state`. No corpus frame changes because of lane 23. Re-run
  that probe only if `Shots.ts` gains a water framing — lane 21's two underwater
  shots above will be the first. `done`

## Combat: what lane 11 left behind (2026-08-31)

*Median den 11.4 -> 17.3 s and danger 3.2% -> 15.2% HP, both against its own
instrument, which it had to build first because `fightshape` computed no median.
Task 36 closed as a measured negative: the "3-12 casts" warp figure was
`dpsshare.mts:113-115`'s **distance labels** — `"from 3 m"`, `"from 12 m"` —
feeding `warpMotion(dist)`. No throughput measurement ever existed.*

- **`SpawnTables.ts` authored hostile `count` fields want widening two deeper on
  both ends**, as `WildTerritories` got. **This is the last 0.7 s of lane 11's
  duration exit** — the two rounds under 18 s are the same 4-animal authored
  territory, and every *wild* den came in at 17.3/26.5/55.9. Leave passive lines
  alone. Also the six `maxEngaged: 3` overrides now equal `Pack`'s raised
  default — drop them or take them to 4. `lane18`/`lane11`
- **The encounter camera has no collision push-out** — the frame where a fight
  starts is 90% the inside of a boulder. `lane11`
- **HUD nameplate, toast and damage-number stacking breaks at 5-8 enemies** —
  they overprint into "SABERTUSKSABERTUSK" and land on the party HP row. `lane11`
- **`Party`/`PartyAI` have no separation force between members at rest**, so
  allies stand inside each other; and the retinue does 60-70% of a fight's damage
  where `dpsshare` says Noctis should be 64%. `lane11`
- **`src/combat/GroundFX.ts` — a white radial ground bloom washes out midfight.**
  Observed, **not diagnosed**, no ablation run. `lane11`
- **`BossFight.ts` 3->4 tokens deliberately not taken** — lane 17's Magitek
  Commander round is new and no instrument was pointed at a boss. `lane11`
- **Two `dpsshare` instrument bugs found**: a `warp` event is a phase
  (`start`/`impact`/`point`), not a cast; and MP fully regenerates before a fight
  is scored, so end-of-fight spend read 0 every round. `lane11`
- **Photograph the party in a combat pose at `SKIN_CLEARANCE = 20 mm`** — the
  one unverified thing behind `e2cf901`. The clearance measurement was taken in
  the bind pose and verified by eye on idle/walk only. `lane2`
- **`drawcheck`/`npcdraws` were not re-run after lane 2's garment work.** The
  draw count is structurally unchanged (same meshes, same materials) but the
  garment material is shared with 29 NPC bodies, so it wants confirming. `lane2`
- **Composition call: the NE sector looks out on the Insomnia megastructure
  skyline.** Present at both the old and the new `adamantoise_graveyard` pin, so
  the site move did not introduce it. Whether the bone country should have a dead
  city on its horizon is an art-direction decision, not a lane's — lane 21 can
  frame around it either way, and `Megastructures.ts` is where it lives. `lane18`
- **Redirect a probe's stdout to a file.** The agent task buffer keeps ~30 lines
  and `perfpoi` prints ~200, so a long probe silently truncates — which is
  exactly the shape that gets misread as a pass. Cost lane 5 a whole conclusion
  tonight (it lost a baseline `driftcheck`'s numbers to `tail -14` and drew the
  wrong inference from what survived). `lane18`


- **`PoiKits._make` builds a site at whatever `Terrain.heightAt` says when the camera first comes within `BUILD_R`, and that answer moves by 13 m.** Measured at Galdin Quay: `heightAt(2330, 2380)` reads **12.93** before the clipmap has settled there and **-0.4** after 140 settle frames. Under `framecam.mts` the `_town` deck came up at y ≈ 0.55; under `shoot.mts` the same site came up at y ≈ 14, and four lane-21 corpus framings authored against the first number photographed the deck's planks from underneath. `PoiKits.anchorAt('galdin_quay','plaza')` returns 14.01 and agrees with the corpus, so the anchor is the trustworthy number and `heightAt` at build time is not. Two consequences worth fixing rather than documenting: a site's world Y should not depend on approach order, and any tool that derives a camera from `heightAt` near an unbuilt site is deriving it from a number that will change. (Lane 21, 2026-08-31.)
- **`framecam.mts` cannot preview a `dungeon:` shot.** `Dungeons` selects an interior from `game.currentShot`, which under `framecam` is the `__probe` slot; both dungeon candidates came back as the underside of the open-world terrain at y −46 with the camera buried. Either teach `framecam` to enter, or say so in its header — a buried frame reads exactly like a bad framing. (Lane 21.)
- **A fixed camera can never contain a dungeon fight.** `Dungeons._arm` spawns non-boss encounters on the party and arms a boss only when the party walks into its room, so a `pos`/`target` shot in a dungeon room photographs an empty room however many enemies the dungeon has. Lane 21's two dungeon shots are `follow: 'player'` + a scenario for this reason; anyone authoring another one should copy that shape. (Lane 21.)
- **A tutorial card ("WHERE YOU ARE", "THINGS YOU CAN USE") renders over `framecam` frames even with `hud` unset.** `Game.applyShot` clears `hud.toasts`, but these are not toasts. Harmless in a probe, wrong in a capture. (Lane 21.)

### Lane 23, lifetime 2 (2026-08-31): what the verification pass left behind

- **`Water.ts`'s Snell band straddles the critical angle, and narrowing it is
  an open A/B, not a fix.** `win = smoothstep(0.575, 0.715, ci)` returns 0.29
  at `ci = 0.616` — 52° off vertical, three degrees *past* the 48.6° critical
  angle, where the underside should be an unbroken mirror. Narrowing to
  `smoothstep(0.660, 0.706, ci)` was tried and **reverted**: the A/B was
  confounded by `3c59927` landing between the two captures, and the mint-green
  foliage blobs it was aimed at survived it (they are wave-normal windows, not
  sub-critical leak). Whoever picks this up: shoot both bands against **one**
  build, and weigh it against the standing note that these framings already
  read closer to a night dive than a midday one. Files: `src/world/Water.ts`
  (lane 23), one line.
- **No underwater framing exists that is inside Snell's window.** Both
  `under_alstor` and `under_vesper` look up at ~38° of elevation, so 100% of
  the ceiling in both is outside the 48.6° cone and the compressed sky disc —
  the single most recognisable thing about being underwater — **has never been
  photographed in this project.** A third framing looking near-vertically up
  would show it. Needs a `Shots.ts` entry (lane 21) or another
  `framecam --probe` derivation (lane 23's `nanunder.mts` already resolves the
  deep points; only the target vector needs changing).

## First load: what lane 14 left behind (2026-08-31)

*86.63 -> 72.15 MB to first frame across two of three tiers, with the instrument
built first because `coldload` had been measuring bytes to `GAME.ready` rather
than to a frame. It found a defect in itself on the way: READ ran before a
deferred tier started fetching, so a working deferral read identically to a
missing file — the pre-fix instrument would have scored the tiering **zero**.*

- **`texc` mip 0 -> a deferred tier is the last −14.4 MB**, and it needs
  `Face.ts`, which is lane 1's. A four-step patch is written out under
  `FOR LANE 1` in `project/handoff/lane14-firstload.md`, including the
  `dropCanvasAfterUpload` trap, the dispose-and-re-upload requirement, and why
  the one-line "bake at 512²" alternative breaks the hit-equals-miss promise.
  `lane14`
- **Row-delta before the plane split in `encodePlanes8`: −3.4 MB on
  `tex.bin.gz` alone** (31.86 -> 28.47 at gzip -9), lossless. Changes
  `FieldCodec`'s shared format. `lane14`
- **Byte-plane-split the `q16d` u16 stream: a further −1.13 MB** (`h` 5.59 ->
  4.80, `far` 1.64 -> 1.30). `lane14`
- **Re-run `coldload --prod --gate` on a quiet tree with all five artifacts
  present**, to replace the 72.15 MB *arithmetic* with a *reading*.
  `texc.bin.gz` was pruned **five times** tonight between a bake finishing and a
  measurement starting, because `CANVAS_SOURCES` contains `Face.ts`, lane 1
  committed into it all night, and every commit by anyone runs `vite build`.
  `lane14`
- **`docs/BOOT_PERF.md` still carries the pre-tier table** and no
  `q=high`/`q=ultra` geo caveat — `q=high`, the default and what a real visitor
  gets, does not fetch `geo.bin.gz` at all. `lane14`
- **`pnpm run build:full` is unreliable under contention**: the canvas bake died
  with `socket hang up` (ECONNRESET on the page's POST back to the bake socket)
  and the `&&` then skipped the geo bake, leaving one artifact silently absent.
  `lane14`

## Chocobo POI kit: what lane 22 found and could not fix (2026-08-31)

*Task 71 landed — two hubs, dye tiers (yellow free to black 12 000), sylkis feed
tiers that finally wire `Ascension.value('chocoboStamina')` which nothing had
ever read, and two of three races won end-to-end by a probe. The third race is a
measured negative with two instruments agreeing. All of the below is
`PoiKits._chocobo`, which was lane 18's and is now unowned.*

- **`_chocobo` has no terrain follow, and it shows at every chocobo POI.** The
  red gable steps punch through the barn roof as a saw-tooth of red tabs on both
  rakes, **visible at 80 m** (`NG=5` boxes uncovered by the roof slabs); the
  paddock fence runs through the barn (far corner at radius 21.9 m against
  `R = 20`); three of six hay bales get `y = 2.5` with nothing beneath them and
  intersect the tarp. `lane22`
- **`_chocobo` ignores the POI's own `r`** — 48 at the layby against 200 at Wiz —
  and places every part at kit-local `y`. **Terrain-following placement plus a
  road-clearance offset is the precondition for an Alpine hub existing at all.**
  Measured there: 20-30 m of relief across the kit's 40 m ring, barn wall
  overhanging the carriageway by ~1.7 m, half the silo on the road, the barn's
  east third inside the mountain and its west gable over a cliff. `lane22`
- **`ChocoboHub`'s prompts are world-axis while the kit is yawed**, and no
  yaw-blind radius inside the ring is empty, so they sit outside the fence. The
  real fix is a runtime yaw lookup from `Props`. `lane22`
- **Bird sculpt, two seams:** the thigh/hip masses are two bald spheres butted
  onto the shingled flank, and the cream chest bib is a separate egg with a hard
  seam. The rump shingles are fixed; the shoulder still spikes. `lane22`
- **The rider's arms read splayed, and `POSE_RIDE` is NOT the bug** —
  `Skeleton.ts:154` mirrors bone translation only, so the pose table is provably
  mirror-symmetric. Re-shoot before re-tuning. `lane22`
- **Still owed on lane 22:** `npcdraws` / `drawcheck` / `--perf` with the bird in
  frame, and a mount-legality refusal probe (55 deg slope, lake edge). The
  draw-cost instrument does not settle its own control, so **quote no draw number
  for the mount**. `lane22`


## From lane 11 (fight shape), respawn — 2026-08-31

- **`CameraRig` has no collision push-out against world props at combat framing
  distance.** `f-engage` of `tmp/shots/lane11/` is the camera fully inside a
  boulder: the whole frame is dark rock with five enemy nameplates floating in
  it. This is the frame where a fight *starts*. Whoever owns the encounter
  camera. `lane11`
- **The HUD does not survive the density increase.** Dens now draw 5-8 hostiles
  where they drew 3-5, and enemy nameplates overprint each other into
  "SABERTUSKSABERTUSK", land on the party HP rows, the technique list, the
  Armiger bar and the minimap's zone label; reward toasts stack three deep on
  each other; floating damage numbers are drawn on top of one another (169 over
  431). Nameplates and toasts need collision/stacking rules. `lane11`
- **Two party members stand inside each other**, in `f-victory` and `f-after`
  both — two torsos in one volume. There is no separation force between party
  members at rest. `src/characters/ai/PartyAI.ts` / `Party`. `lane11`
- **The retinue does 60-70% of a fight's damage** (`ignis 32% gladio 31% warp
  22% noctis 8%` in one round; 29/28/22/12/9 in another). `probes/dpsshare.mts`
  says Noctis should be 64% at full uptime. Party throughput is the other half
  of the duration lever `WildTerritories`' own comment names, and it lives in
  `PartyAI.ts`. `lane11`
- **Enemy corpses vanish instantly and the kill frame's motion blur is heavy
  enough to make the action illegible.** Observed, not diagnosed. `lane11`
- **`fightshape`'s six-round run only played three**: the page lost its vite
  connection mid-run (`[vite] server connection lost`) with seven lanes editing
  the trunk. The medians quoted for this lane are over three finished fights and
  should be re-run on a quiet tree before anyone treats 23.0 s as final. `lane11`
- **`BossFight.ts` 3 -> 4 engage tokens was on the plan's lever list and is
  still NOT taken.** Lane 17's Keycatrich Magitek Commander round is a
  Definition-of-Done content bar and no instrument points at a boss fight —
  `fightshape` walks into wild dens. Changing boss pacing blind is not worth the
  risk; it needs its own instrument first. `lane11`
- **A hard-clipped white quad sprite on the ground**, with visible square
  corners and a bloom halo — a loot/drop sparkle, not a ground ring. Seen in the
  round-2 aftermath frame of `tmp/shots/lane11c/`. Whoever owns the drop/pickup
  VFX. `lane11`
- **`VFX.shockwave` still passes `intensity: 3.4, opacity: 1`** and so is not
  covered by `GroundFX.ring`'s new 1.35/0.6 defaults. It is the only remaining
  path that can clip a ground ring to flat white, and no fight beat this lane
  captured exercised it — a boss round would. `lane11`
- **Gladio's greatsword passes through Prompto's shoulder** in `f-victory`, and
  in `f-after` a fourth party member stands inside the camera with his head
  clipped at the frame edge behind the HP panel. Same owner as the
  party-separation item above. `lane11`
- **`f-kill`'s radial motion blur is heavy enough that nothing in the frame is
  legible** except the HUD. Whoever owns the post stack / the kill camera.
  `lane11`
- **Band the Meteor's `aEmissive` veins to `relief`'s step index**, so a fissure
  runs ALONG an arris instead of across the terraces. Four mechanisms have been
  through `meteorVeins` and the fourth still reads as glowing lozenges, because
  the step-fracture relief chops the ribbon every 7 m. Needs
  `Rocks.rockGeometry` to return the step index as an attribute — a shared file.
  **Not a tuning change**; do not re-tune radiance instead. `lane20`
- **Lane 1 — the alar BALL is the last third of the mid-face diagonal, and it
  costs the nostril.** `c6013aa` softened the alar crease (peak surface
  Laplacian on the cheek 9.00 -> 5.09 mm, fold 8.85 -> 5.94 mm) and the ball at
  `p [15.5,-36.5,85.5] amt +12.5` is now the largest single term there (2.91 of
  5.09). Widening it to `r [13.0,13.5,21.0]` with the amount held takes the peak
  to **3.53** and leaves the ball's own projection *higher* (10.35 -> 10.51 mm),
  but the two brushes overlap and the nostril opening loses **27%** of its depth
  (-8.34 -> -6.08 mm). Measured, not landed. `lane1`
- **Lane 1 — the eye crescent is a 1.5-2 mm band under the lower lid margin and
  here are the millimetres.** Marching the sculpted skull against the globe's own
  silhouette (`FACE.eye` 33.5/-6.0/64.6, R 10.70; lower lid margin peaks at
  -0.712 rad = y -13.0 mm; globe runs to y -16.7): at y = -13 the globe stands
  **1-6 mm** in front of the skull across x 26-41, at y = -14 **1-3 mm**, and by
  y = -15 the skull covers it. Two candidate fixes, neither landed: a ledge brush
  at (33.5, -13.5) r ~[13,7,20] amt +4 mm (anatomically the lower lid roll, but
  4 mm through a 7 mm y-radius is a *rail* and a rail is what left the last dark
  slash under the eye), or sinking `FACE.eye`'s z 0.0646 -> ~0.0616, which moves
  the globe *and its lids together* so only globe-to-skull changes. The second
  is smaller and better targeted. Judge either on `facefront_flat`. `lane1`
- **Lane 1 — at 3x the hair is a pile of flat cardboard strips.** Hard
  rectangular card ends, visible flat facets down each card, and near-black gaps
  between them (`tmp/shots/l1r4-occ/prompto_facecheck.png`, rect 704,18 288x180
  at 3x). The gaps are where the hair's p5 lives, which is why no amount of fill
  reaches §12.3's floor of 20-22. Card geometry and the cutout, not shading.
  `lane1`
- **Lane 1 — the fill is a fifth of the hair pixel, and that is the budget.**
  Measured this session: a +21% change to the sky fill's level moved Prompto's
  hair median +5% and a +19% change to its albedo weight moved Noctis' +17%.
  Anyone planning another hair value change should size it against those two
  numbers rather than against the fill's own coefficient. `lane1`

## Cities: what lane 19 left behind (2026-08-31)

*The sunk-feet defect is fixed — all 29 city bodies read `sink 0.000`. It was
never `PLAZA_Y`, never a constant and not approach order: **nine bodies were
standing inside the furniture** (a stall counter 0.81 m up, a building plinth
0.50, a wall 1.07), plus one buried 0.741 m in the graded apron and Navyth
floating 0.189 on a plinth's batter. Each was authored 1-2 m off a **stall**
anchor, and a stall anchor is already 1.1 m clear of its own counter, so a side
offset of 1.5-2.6 m walks straight back into the bench. In one frame three
people were cut by half a metre and nine were perfect — a tuned offset would
have fixed one capture and left the rest.*

- **The city POI compounds are not in `CollisionWorld` at all.** `groundDisc` at
  all 29 city bodies returns `onProp false`, with raw terrain **0.7-1.1 m below
  the pavement they stand on** (Lestallum deck 121.215 against collision
  120.12-120.84; Galdin 14.012 against 12.86-13.48). **The player walks under the
  square's own deck.** A gameplay defect, outside the lane that found it — and it
  is also why `_clearSpot` is currently a no-op, kept because it costs nothing and
  becomes the durable fix the moment the props are registered. `lane19`
- **Both squares are shut in, measured.** `citysight.mts`: Lestallum reach min
  4.0 / median 5.5 / max 16.0 m; Galdin 5.5 / 9.0 / 16.5 m; **16 of 16 bearings
  block inside 20 m at both.** Much of the near blocking is the square's own six
  stalls on a 7.8 m ring plus six light poles, so it is not all block plan — but
  no long lens crosses either plaza at deck height. `lane19`
- **Galdin Quay is 712 m from the sea** — nearest water at 46°, level −6.5,
  plaza deck at 14.0. **No camera on that square can see water.** A content call,
  not a framing problem: `galdin_pier_sunset` and `galdin_angelgard` are judged
  rows and need a camera on the coast. `lane19`
- **EXINERIS steam and awning variance** — the last third of task 67, not done.
  The recipe for doing it inside `CityHub` without touching another file is in
  `project/handoff/lane19-cities.md`. `lane19`
- **Two capture traps worth keeping:** `applyShot` on a cold page returns a
  **white rectangle** until ~200 settle steps, so `framecam --settle 60` is not
  enough; and hiding every non-person mesh to isolate bodies **takes the bounce
  light with it**, so dark trousers on black read exactly like missing legs.
  `lane19`

## Night and the clock: what the task-64 verification found (2026-08-31)

*Task 64 is VERIFIED — 30 game minutes at 23:12, 23.29 km driven after dark,
`_nightRoadDanger` reached on 70 386 frames, rolled 11x, spawned 6, HUD warned
6x, banter 6x, pulled over for 6; `daemon_pack` x5 and `ronin_duel` x1.
Reproduced exactly (11/6/5) on a second run. Day control unmoved at 2.14 km.*

- **`probe.mts` silently drops unknown `--` flags.** One loop that throws on an
  unrecognised token closes this whole class — and this class produced a
  confident 30-minute PASS about the wrong time of day tonight. **Not taken
  because lanes were invoking `probe.mts` live**; take it once the wave is done.
- **Task 64's "already fighting" guard is really a proximity guard.**
  `RegaliaSystem.ts:792` uses `enc.enemies.countNear(pos, 90) > 0`, and
  `Enemies.countNear` (`src/characters/Enemies.ts:341`) counts **every live
  enemy**, not a fight. Measured: it blocked **5 of 11 rolls**, and nothing else
  blocked anything. The director's own roll uses 60 m
  (`EncounterDirector.ts:984`). One-liner in lane 10's file; reported, not taken.
- **The plan's task-64 done-when should read
  `--set __PLAY_NIGHT=1 --turbo 10 --ttl 30`, not `--night`.**
- **`TIMINGS.md:169`'s canonical triple has drifted** to `2.14 km, 3 encounters,
  18 forage` on tonight's tree — the route is identical, the world changed.
  Re-baseline after the wave.
- **At night the headlamps bloom into solid white discs that wash out the road
  they light.** A look note from the ambush frames, not from a gate.

## The chocobo, after three lifetimes (2026-08-31)

*The mount is summonable from minute one, rides at 11.00 m/s, both hubs work,
dye and feed tiers are probe-verified, two of three races are won end to end, and
the kit's frame-found defects are fixed and verified by eye. `chocobolegal.mts`
now exercises the refusals for the first time: dry (1.6 deg) mounts, wet (h −47.5
against level −6.5) refuses, steep (83.8 deg against cos50) refuses, and a refused
`mountAt` leaves state alone. Draw cost is **10.7 calls for mount plus a
three-bird flock**, 476.2 of an 800 budget, on an instrument that was aliasing
until tonight.*

- **The rider has no legs** — a black blob over the fore-flank ending at
  mid-barrel, nothing in the stirrup, on all four birds. The loudest remaining
  defect on a ridden frame. `lane22`
- **The rider's two hand meshes differ** (closed black glove against bare open
  hand), so a mirror-symmetric `POSE_RIDE` still renders asymmetric; **nothing
  holds the reins**; and a **sword blade passes through the bird's neck** while
  mounted. Three items, **none of them the pose table** — `Skeleton.ts:154`
  mirrors bone translation only, so the table is provably symmetric. `lane22`
- **The neck and head are now the worst surface on the animal** — a smooth
  unbroken tube with a peach wedge, bridle drawn as black wires. And the bib is
  near-cream against saturated yellow: the down rows fixed the smoothness and
  left the value break. `lane22`
- **The far thigh is still a bald sphere**, and the next move is named and is
  **not another radius**: it is the `Euler(pi-0.26, a*0.7, 0)` yaw, which fans
  the coverts off the leg instead of laying them down it. `lane22`
- **`_apron`/`gradePad`/`_base` cannot produce a level deck on 59 m of relief**,
  and six kits inherit it. This is what blocks the Alpine hub and `race_alpine`,
  and it is **not fixable inside a kit function**: `_base` clamps to ~+-3 m of the
  pin and the batter reaches only `r` further at 1:3. `lane22`
- **Grass punches through every POI apron**, very visible at Wiz on all bearings.
  `PAD_R`'s docstring names the fix (`Ecology.poiClear` plateau-plus-skirt) and
  assigns it to the vegetation lane. `lane22`
- `M.cloth` is navy, so the hay tarp reads as a dark blue tent — shared by six
  kits. Four pale thin stakes stand on the Wiz apron inside the fence at 40 m,
  unidentified. `lane22`
- **`Shots.ts` owes four chocobo framings**, and without one `npcdraws` cannot be
  run with the bird in frame. `ControlsScreen.ts` owes a Chocobo group (`6`
  whistle/dismiss, `E` ride, `Shift` sprint). `lane22`
- **Galdin's sea and its golden light are on different bearings**, measured over
  nine shore frames: west into the sun is the best light of the nine and contains
  **no water at all** (the sea is behind the dune ridge); seaward has 22-25% water
  and no warmth. Only south-west along the shallows has both, and it is the only
  aim containing the jetty. Structural, not a framing preference. `lane21`
- **A hard horizontal seam at the sea horizon**, with the far band dropping to
  near-black, and **shore foam drawn as flat white axis-aligned rectangles.**
  Both visible on every seaward Galdin stand. `lane7`/`lane21`
- **An animal stands on top of an untextured mesa island out at sea** — a spawn
  on ground it could not have walked to. **A judge would flag it instantly.**
  `lane11`/`lane18`
- **The "WHERE YOU ARE" HUD card composites over `framecam` previews only** —
  confirmed `framecam`-only, since all five `shoot.mts` captures in the same
  session were clean. A preview fault, not a corpus one; closes an open question
  from an earlier pass. `lane21`
- **Three HUD elements draw at the same screen point and stack.** In both tomb
  frames a live `Claim` prompt is **completely hidden** behind the onboarding
  hint card, and the `COEURL / VICTORY` banner lands there too — prompt, hint
  and victory banner all centre on the thing you are standing at. **Nobody owns
  HUD stacking**, and lane 11 independently reported nameplates and damage
  numbers colliding at 5-8 enemies. `tomb-reach`/`lane11`


## Content shots: what lane 21's final pass left behind (2026-08-31)

Everything here was seen in a frame this session and the frame is named. Nothing
here is a framing problem; `galdin_pier_sunset` was the last one that was, and it
is landed.

- **Galdin's sea offers exactly two looks and both fight the plate.** Deep water
  (sea bed under about −8 m) renders **near-black** and holds only ripple and
  specular glitter; shallow water renders as a **gold-and-black mottled stipple**
  because the lit sand bottom shows through, and at any size it reads as a wet
  sand flat rather than sea. There is no turquoise between them, which is the
  one thing every FFXV Galdin plate is made of. Measured across 44 framings
  spanning 55–260 m offshore. `tmp/shots/l21-pf/GB_mid.jpg` is the stipple,
  `tmp/shots/l21-pg/HA.jpg` the black. **Chroma, not framing.**
- **`lest_street_night`'s two near-lens NPCs render as unlit black cutouts** —
  no material, no rim, no read — and one of them is in the arms-raised
  palms-out broken idle. It is a judged PAIRING row.
  `tmp/shots/l21-city3/lest_street_night.jpg`.
- **A cyan pickup-glint sprite floats over the beach** in the landed
  `galdin_pier_sunset` at x 0.93, y 0.37, and in six other shore candidates.
  `tmp/shots/l21-pfinal/galdin_pier_sunset.jpg`.
- **An animal stands on top of an untextured flat-shaded mesa island out at
  sea**, on ground it could not have walked to. `tmp/shots/l21-pier/PS2o.jpg`.
- **Shore foam renders as a bright continuous white band**, and from stands
  inside ~110 m as flat white axis-aligned rectangles.
  `tmp/shots/l21-pf/{GD_midHigh,GE_nearHigh,GK_wide}.jpg`.
- **The location title card and the "WHERE YOU ARE" tutorial card are composited
  into `framecam` captures and not into `shoot.mts` ones.** Confirmed again this
  session: eight corpus captures clean, half the previews carrying it. A preview
  fault, but it costs an agent a re-shoot every time it mistakes one for a
  corpus defect. `tmp/shots/l21-pf/GB_mid.jpg` against
  `tmp/shots/l21-pfinal/galdin_pier_sunset.jpg`.
- **`imgdiff --calibrate` overwrites `project/noise-floors.json`'s `note` with a
  two-line stub**, discarding the stale-output-directory warning that the file
  exists to carry — the warning about the exact mistake `--calibrate` invites.
  Restored by hand this session; it will be thrown away again by the next
  calibration unless the tool preserves an existing note.
- **`lest_market_day`'s crowd is bunched at the two frame edges** with about 30%
  of the image bare paving and one lone walker in it, and the plaza paving reads
  as a regular tiled floor with very dark joints rather than laid flags.
  `tmp/shots/l21-city3/lest_market_day.jpg`.
- **`lest_overlook_disc`'s upper-left quadrant is ragged black cloud blobs with
  vertical comb artefacts over fat white star sprites**, and the Meteor's
  fissures read as flat cyan patches painted on facets rather than as glowing
  cracks. `tmp/shots/l21-city3/lest_overlook_disc.jpg`.
- **The Alpine Stable's prompts have nothing to bind to.** `_reanchor` now binds
  the kit's published anchors at Wiz, but `meldacio_layby` is
  `type: 'parking'` (`WorldMap.ts:708`) and `PoiKits` picks its kit off
  `poi.type`, so the stable publishes **no anchors at all** and its two prompts
  remain world-axis offsets on a lay-by — 10.3 m and 15.3 m from the pin with
  nothing built around them. Either give the lay-by a stable kit or move the
  prompts onto something that exists. `CHOCOBO_HUBS`' docstring still describes
  the old symptom. `chocobo-reach`
- **A give-up timer that counts from boot rather than from arrival.** Deleted
  during the fix, but worth knowing as a shape: `ChocoboHub`'s
  `_tick > 30 * 40` had been dead for the session 20 s after boot, so the
  late-bind poll silently stopped running long before the player could reach any
  hub. Pre-existing, and fatal the moment a prompt's `enabled` hung off that
  bind. `chocobo-reach`


- **`galdin_restaurant` is shot from under a parasol.** 80% of the frame is the
  flat maroon underside of a canopy; the picture is a sliver of paving, one
  NPC's leg and a shadow along the bottom edge. It is the smallest healthy
  frame in the corpus after the whiteout fix — 48 096 B against a corpus median
  of 244 320 — and it is a stand/aim problem in `src/game/Shots.ts`, not a
  render one. `tmp/wf/corpus/galdin_restaurant.jpg`. `white-frames`
- **`dun_balouve_drift` is 78.5% crushed black** — 78.5% of the frame is at or
  below 3/255, `meanL` 2.01, `p50` 1.0, and the whole picture is one lit stone
  shaft at frame centre with drifting motes around it. It reads as a deliberate
  dark mine and it is still too crushed to be good; it is also the single
  tightest margin `framecheck`'s `black% >= 98` has (1.25x), so opening it up
  buys the gate room as well as buying the frame a picture.
  `tmp/wf/corpus/dun_balouve_drift.jpg`. `white-frames`
- **The Insomnia LOD's "solid pure-white blocks" at night were probably this
  bug, not an emissive problem.** `HUMAN_REVIEW.md` records `capital_mega_cityLit`
  clipping to pure white in `tmp/shots/l21-arc/MO_7.jpg`. `capital_mega_city` is
  one of the 43 meshes whose vertex colour came back out of `geo.bin.gz` as an
  unnormalised `UNSIGNED_SHORT` (`e848801`), and `zone_mencemoor` went from
  84.2% clipped pixels to 0.58% on the fix alone. **Re-shoot `MO_7` before
  spending an art round on it.** `white-frames`


## From lane 12c (traversal and HUD stacking) — 2026-08-31

- **The animator has no slide pose, which is the fourth of the playtest's four
  slope complaints.** `Player.update` does `velocity.multiplyScalar(body.progress)`
  and `_gaitWant = speed * progress`, so a character sliding down a face he
  cannot climb scores `progress` ~0 and holds the *idle*: he now moves, but he
  moves standing still. `CharacterController.slip` (0..1) is published and is
  the hook. `src/characters/Player.ts` and the animator — not this lane's files.
  `lane12c`
- **The camera buries itself in a hillside on foot, not only in combat.**
  `tmp/shots/l12c-after/slip_note.png` is the camera inside the ground at the
  foot of a 60 deg face — the playtest's "camera buried" verbatim. Lane 11 filed
  the same defect against the *encounter* camera; it is `CameraRig` generally.
  `lane12c`/`lane11`
- **The area/title card is a 54 px watermark across the middle of the frame.**
  `.areacard` sits at `left:10.5%; top:40%` and fires on arrival regardless of
  what else is on screen — over the party in `hud_field`, and the playtest read
  two in a row as "giant overlapping watermarks across the combat HUD".
  `src/ui/Layers.ts` now has a `feature` band and a `PRIORITY.areaCard` for
  exactly this, but **nothing claims it yet**: the card should yield to a fight
  and queue behind a victory. Half a lane's work, all inside `src/ui`. `lane12c`
- **Two more same-band pairs, both across files this lane does not own.**
  `.cine-line` (bottom 15.5%, `#cine`) and `.subs` (bottom 13.5%, `#hud`);
  `.chapcard` (`top:40%`, `#cine`) and `.areacard` (`top:40%`, `#screenfx`).
  Neither pair has any mutual gate. `lane12c`
- **`Minimap` uses the offset text-shadow `ui.css:29-35` explicitly bans**
  (`0 1px 2px …` at `Minimap.ts:479,484,489` — an offset shadow prints a
  readable second copy of the glyph one pixel low) and `--ink-4` for
  `.mm-scale`. It is a self-contained `<style>` tag that deliberately does not
  use the ui.css tokens, and its caption is one of the least legible things in a
  bright field frame. `lane12c`
- **~30 menu-screen rules are still `--ink-4` with no text-shadow** — the same
  defect lane 10 fixed on `.arm-gauge .d` and this lane fixed on
  `.armiger .ar-note`. Over the menu scrim rather than over terrain, so lower
  severity than the field ones, but it is the same one-line recipe each time.
  `lane12c`
- **`probes/slopewalk.mts` deserves a place in the suite.** Fixed seed, ~90 s,
  and it is the only instrument that can catch the silent dead-stop coming back:
  it censuses the field's slope and then walks fifteen real hillsides. Its
  companion `probes/hudstack.mts` opens all sixteen screens with a tutorial card
  up and measures the ink inside the reading band — it caught 83 px on 16 of 16.
  `lane12c`/`lane16`
