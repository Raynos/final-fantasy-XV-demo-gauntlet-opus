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

- **`KeyT` is bound twice** — `CombatSystem.ts:1519` `drawEnergy()`, `RegaliaSystem.ts:60` Type-D — and `ControlsScreen.ts:57` lists `T` as Type-D only. Deposits are visible and prompted now (`c220833`), so a live mechanic has no correct in-game statement of its key. `water-fix`
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
- **`Props.landmarks` ~46 ms — `PartBuilder`-shaped, "a five-line addition, skipped for want of time".** Cheapest open boot item in the repo. `geometry-bake`
- `Vegetation.bushes.build` ~120 ms — untried; nobody has split geometry from instanced plumbing. `geometry-bake`
- `Props.rocks` ~78 ms — untried; `Rocks` has no `root` and no `PartBuilder`. `geometry-bake`
- **Caching `Vegetation.prime`'s *result* (610 ms) is untried** — a different idea from deleting `prime`, which is a recorded negative. The streamer's tile bookkeeping must be restored with the matrices or the world desyncs on first `update()`. `geometry-bake`
- Character LOD: `town_forecourt` 465 calls / 5.33 M tris, one `SkinnedMesh` bucket at 60 calls / 1.74 M tris / 28 940 per draw. Headroom, not cost. `materials`
- `Wear.ts:873` keys its program cache on `tex.uuid` for GLSL that is byte-identical every time. 1–2 programs, free. `materials`
- 22 dedupable programs in `characters/rig/` (`char2-eye<N>`, eye `gloss` is a GLSL literal). `materials`
- Water's reflection pass spends ~40 draws on shots with no visible water (`Water._visible` is a bbox test). `perf-r4`
- NPC eye globes + contact-shadow blobs, ~28 draws. The globes cannot merge — independent gaze pivots. `perf-r4`
- Wave 3's frame-cost split, pixel-scaled vs fixed. Recipe written, never run. `perf-r4`

## Sky, grade and light

- **`zone_vannath`'s foreground sits under a cloud shadow at luma 13/255.** `shadowScale` 3.5 maps a 9.45 km field onto a 2.7 km tile → ~640 m patches under 2.25 km clouds. **Do not take `shadowScale` to 1.0 alone** (one patch in the visible world) and **do not deepen it** — 26% of sunlit against a real 11%. `sky-clouds`
- **Cloud internal dynamic range — "the top of the next list".** Crown and self-shadowed base differ by well under a stop; no interior structure at 4×. Levers: `cloudDensity`'s remap steepness and `uCloudSunGain` against `uCloudMaxRad`. **Not** `uCloudTap`, **not** `MARCH_SCALE`, **not** exposure — all recorded negatives. `sky-clouds`
- **`hi(R−B)` −20.7 against the reference's −13.5**, `R−B` −17.9 against −8.5; both moved the wrong way. **Do not chase with a tint** — build a sky-matched reference slice first (our vistas are 40–60% sky against the plates' 20–25%). `sky-clouds`, `ground-light`

## Vegetation, alpha and occlusion

- **The impostor ring at 210–280 m is the 1:1 texel band** (0.74–1.13 texels/px) and holds the treeline's residual speckle. `leaftexel.mts` prints it per shot. `alpha-edges-r2`
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
- `project/noise-floors.json` covers 18 shots of 142; the rest diff against a placeholder `DEFAULT_LIMIT = 2.0`, and the recorded floors are *cold* while the daemon reuses pages, so a warm diff runs 4–6× them. plan A
- `project/archive/handoff/` is at 90 files and nothing prunes it.
