# To nine — the build list

Status: PROPOSED (2026-08-29, opus) — **62 named tasks in 14 lanes, all
buildable in parallel, one day of wall-clock.** Every task names the file, the
mechanism and what makes it done. Nothing here says "iterate until it looks
better".

**Lanes collide nowhere.** Directory ownership is stated per lane; run all 14 at
once if the machine allows, or in waves of 4–5. **No lane may add a task to this
file** — leftovers go to `project/TASKS.md`, traps to `project/LANDMINES.md`,
decisions to `HUMAN_REVIEW.md`. This plan archives when the lanes report.

Round 17 is in flight. **When it lands, its ranked tells re-order lanes A–F.**
It does not add tasks; it says which of these to do first.

---

## A · Head — `src/characters/rig/Face.ts`, `Head.ts`

1. **`facewind`'s negative signed volume on `Noctis_body`, `_hair`, `_outfit` and both eye meshes.** Unchecked across two passes, both of which estimated ten minutes. Same class as the inverted skull grid that beat five passes. **Do this before anything else in the lane.** Done: every mesh reads outward, or the negative is explained.
2. **Re-author `paintFace`'s brushes and AO from zero.** Every brush was authored while the face was backface-culled — tuned against the inside of a skull. Pass 6 damped them 30–45% and the frame still shows a fifty-year-old's brow shelf and marionette arcs. **Damping is exhausted; re-derive against the visible surface.** Done: `facecheck` pixel rows no longer VOID; `noctis_front` at 0.55 m has no painted crease that geometry does not justify.
3. **The dark diagonal across the shadow half of the mid-face** — the eye-socket brush's inferior wall at a third of its former size. Another 20–25% is available before the aperture closes. Done: gone at 0.55 m, `mouthEdge` unmoved.
4. **The eyes are asymmetric in a bald front framing** — one reads narrower at the same `eyeOpen`. Never investigated. Done: cause named, symmetric.
5. **`euEu` 162.5 mm against a real 152.** Lower face is heavy for a slim 20-year-old. Done: inside 155.

## B · Hair and costume — `src/characters/` (not `rig/`)

6. **Prompto's hair is near-white; he is blond.** **Ignis's is near-white; he is ash-brown.** Two constants. Done: `hero_full` reads four distinguishable people.
7. **Hair is flat opaque ribbons at 0.55 m.** ~870 roots × 3 locks, 4–5-sided tubes 1.3–2 mm, no alpha. **A 1.5 mm lock at 4 m in a 1600 px 50° frame is 0.7 px — sub-pixel opaque geometry cannot be antialiased and can only shimmer.** Decide the representation (alpha cards vs fewer, wider locks) from that number, then build it. Done: no shimmer under `--cold` A/B at 4 m.
8. **Hair textures are `mips: 0` on all four heads** — 128 px, anisotropy 16, no mip chain, 9.01 texels/px. Done: mip chain present, verified by `leaftexel`.
9. **Ignis is one black column** — no hem line, no lapel thickness, no collar break. Done: three separations visible at 4 m.
10. **The sleeve cut** — real work on `piece('sleeve')`. Three attempts *as a surface* are a recorded negative; it needs geometry.
11. **Noctis's skull print** is vertex-coloured on a 42×76 shirt sweep and smears at 0.95 m. `printWindow`/`printSteps`/`printSeg` exist for exactly this.
12. **A triangular hole at Noctis's collar**, skin through it.
13. **`_probe/hands.mts`'s `_palm*` framings are inside the geometry** — nothing has ever looked at a palm.

## C · Aprons and props — `src/world/props/Wear.ts`, `PoiKits.ts`

14. **`gradePad` writes world-planar XZ UVs** (`uv.push(ct * s, st * s)`) so a batter's texture varies with **radius, not height** — on the cliff branch the radius moves 1.6 m while `y` drops 26: a **16:1 vertical stretch**. This is the "smeared striations / pasted on" two independent reviews reported. Done: V follows height; a 26 m wall reads as masonry courses.
15. **Fociaugh's cave mouth is buried under a ~40 m untextured apron deck**, filling every approach frame from four vantages. A talus-ramp design that is real collision floor is written in `e5557e5` and cannot land until the apron goes.
16. **Balouve's sill is 15.1 m below the eye at 8 m, 36.7 m at 20 m** — worse than Fociaugh, never reported. Distinct from its 7.09 m apron hang.
17. **The Tomb of the Mystic's pediment hovers on column stubs.** `_tomb` snaps ~16% of columns deliberately; determine whether this is that or a break. Seen twice.

## D · Sky and clouds — `src/world/sky/`

18. **Cloud internal dynamic range.** Crown to self-shadowed base is under a stop where a cumulus wants body ~0.8 and crown 3–4. Levers: `cloudDensity`'s remap steepness and `uCloudSunGain` (`Sky.ts:1036`) against `uCloudMaxRad` 9.5. **Not `uCloudTap`, not `MARCH_SCALE`, not exposure — three recorded negatives.** Done: crown/base ≥ 2 stops, interior structure visible at 4×.
19. **`zone_vannath`'s foreground sits at luma 13/255** under a cloud shadow. `shadowScale` 3.5 maps a 9.45 km field onto a 2.7 km tile → ~640 m patches under 2.25 km clouds. **Do not take `shadowScale` to 1.0 alone** (one patch in the visible world) and **do not deepen it** — 26% of sunlit against a physical 11%. The tile size moves with it. Done: foreground ≥ 30/255, patch size within 2× of its clouds.
20. **`hi(R−B)` −20.7 against the reference's −13.5.** **Do not chase with a tint.** Build a sky-matched reference slice first — our vistas are 40–60% sky against the plates' 20–25%, so the current comparison is invalid. Done: the slice exists and the number is re-derived on it.

## E · Vegetation and alpha — `src/world/veg/`

21. **`coverageAA` is called only from `VegMaterial`** (`:100`, `:266`). Fences, foliage decals, town alpha-cut props, `hh_town_chainlink` (alphaTest 0.14, 1.21 texels/px at 10.6 m) and every character hair card are still binary against a multisampled target. **One line each.**
22. **The impostor ring at 210–280 m is the 1:1 texel band** (0.74–1.13 texels/px) and holds the treeline's residual speckle. `leaftexel.mts` prints it per shot.
23. **Nothing with a silhouette occupies 15–97 m in `hero_full`** — `bush_sage_1_leaf` reaches 15.1 m, the next alpha card is at 97.5 m. **The occupant already exists, instanced and in frame:** pull `scrub_*_card`'s seating range inward. No new asset. Price the draws with `vegcensus` first.
24. **Bush stand-card vs its own geometry-ring albedo**, via `bakeCanopyCard`. Extend `vegalbedo.mts` to bake the card.

## F · Occlusion — `src/world/terrain/`, `src/world/props/Rocks.ts`

25. **`aoBoost` reaches grass and nothing else** (`GrassField.ts:465/485/492`) — trees and bushes carry **no base occlusion at all**.
26. **`Rocks.ts` already writes a vertex colour from `up`/`cav`** that a height-above-own-base factor would ride for free.
27. **Terrain's 1–64 m occlusion band is empty** — detail maps own under a metre, the horizon bake is swept at a 64 m texel, nothing occludes at the scale of a swale.

## G · Memory — `src/engine/`

28. **181 MB of render targets across 33.** `PostFX`. The largest single lever left. Done: under 120 MB with the corpus unchanged at floor.
29. **`AttrPack` does not reach the 116 POI sites that stream in during play.**
30. **`skinWeight` is 20.4 MB of `4x Float32`; glTF ships `Uint8` everywhere.** ~15 MB.
31. **`lestallum` (1.34 M verts) and `galdin_quay` (1.28 M) are 2.6 M of 3.70 M resident.** Nobody has ever looked at a 1.3 M-vertex town. Done: a census of what those vertices are, and whatever is unreachable removed.

**Exit for the lane: tab under 800 MB** (`bootprof --mem --play --prod`), from 1 246 MB.

## H · First load — `src/engine/TexBake.ts`, `GeoBake.ts`, `src/tools/bake.mts`

32. **85.5 MB on the wire, 5 requests**: `terrain.bin.gz` 33.1, `tex.bin.gz` 31.0, `texc.bin.gz` 20.5. 0.27 s local, **~14 s on 50 Mbit before `Game.init()` starts.** Ship a low-resolution first tier and stream the rest, or defer `texc` past `ready`. Done: **under 25 MB to first frame**, measured by `coldload --prod`.

## I · Idle CPU — `src/engine/postfx/`

33. **`post.render` is 74–77% of a 5.9 ms frame** and is the only lever left on a 60 Hz panel — the 60 fps cap helped 120 Hz only. Profile the chain per pass and cut or gate the most expensive. Done: **idle under 30% of a core at 60 Hz** (`idlecpu --q high --dpr 1.5`), from ~100%.

## J · Boot — `src/world/props/`, `src/world/veg/`

34. **`Props.landmarks` ~46 ms is `PartBuilder`-shaped and is a five-line `bakedParts` addition.** Cheapest open boot item in the repo.
35. **`Vegetation.bushes.build` ~120 ms** — split geometry cost from instanced plumbing before caching.
36. **`Props.rocks` ~78 ms** — `Rocks` is a tile streamer with no `root`; needs a different cache entry shape.
37. **Caching `Vegetation.prime`'s *result* (610 ms).** **Not** deleting the prime — that is a recorded negative (`hero_full` moves 13.359/255). The streamer's tile bookkeeping must restore with the matrices or the world desyncs on the first `update()`.

## K · Combat length — `src/game/encounters/`, `src/combat/`

38. **A field encounter lasts 6–7 s against FFXV's 30–90**, and **the level curve is spent** — 1.0 is its ceiling, and 30 s needs ~21 000 hp of den against a top species of 22 000. The two untouched, never-measured levers:
39. **Pack size** — `WildTerritories.count`, `Pack.maxEngaged`, and `spawnRoamer` capping at 3.
40. **Warp-strike throughput** — 26–47% of a den's damage from 3–12 casts.
41. **`RpgSystem.enemyScaling` is documented as reading the party's level and does not** (`:721` is `nightScaling(hour, isDaemon)`), while `EncounterDirector.activate` feeds `levelBonus` into every authored territory.
42. Done for the lane: **`fightshape` reports a median den at 18–30 s** with Noctis paying ≥15% of his HP, `combatloop` still 31/31, both perf gates certifying.

## L · Input and controls — `src/ui/screens/ControlsScreen.ts`, all input sites

43. **Audit every binding in `ControlsScreen` against what the code does.** The car's steering was mirrored and shipped because `AutoDrive` was self-consistent in the same flipped frame — every instrument agreed and only a human disagreed.
44. **`KeyT` is bound twice** — `CombatSystem.ts:1519` `drawEnergy()` and `RegaliaSystem.ts:60` Type-D — and `ControlsScreen.ts:57` documents only Type-D.
45. **A gate that drives the car and asserts the sign of a turn.** `regaliadrive` asserts it steers *at all*, never which way; all five posed regalia shots are a parked car.
46. Done: every documented binding does what it says, and a gate covers direction.

## M · Water — `src/world/water/`, `src/world/terrain/Field.ts`

47. **The tarn surface reads as dense white foam mottle across the whole body** at `maidenwater` — *after* the foam-band fix (45.7% → 14.9%), so not that item.
48. **The shallow river reads as a transparent grey sheet over gravel.** Two lanes, two levers, both on the table: `RiverMaterial` and depth, versus **conditioning the channel in `Field.ts`** — *"a reach on a flat pan has no banks to have water between"*.
49. **The discharge proxy is zero on 85.8% of stations**, so most of the network is the minimum channel. Lowering the 0.88 pivot retunes every river in the world — price it before taking it.
50. **Malacchi Pond has no pond** — nearest water 133.5 m away, 28 m below.
51. **Boulders under Crestholm outside `Ecology.rockScatter`** — ~23 instances deeper than 1.2 m.

## N · Gates and instruments — `src/tools/`

52. **Nothing in `check` fails when a bake artifact is missing.** `geo.bin.gz` was absent for a day (~1.2 s of cold boot) while five handoffs said "whoever is next should re-bake". `daemon --health` warns; no gate does.
53. **`assertAttributeContract` is not wired into a generator** — the last unwired row; the other three asserts are wired.
54. **Grep for unguarded `normalize(` and `pow(` with a varying base** across the remaining shaders. Both NaN bugs this month were an operation undefined on its input reaching the frame through a path that looked safe.
55. **`project/noise-floors.json` covers 18 shots of 142**; the rest diff against a placeholder 2.0, and the recorded floors are *cold* while the daemon reuses pages, so a warm diff runs 4–6× them. Calibrate the 30 judged shots.
56. **`Wear.ts:873` keys its program cache on `tex.uuid`** for GLSL that is byte-identical every time. 1–2 programs, free.
57. **22 dedupable programs** in `characters/rig/` (`char2-eye<N>`, eye `gloss` is a GLSL literal).
58. **Water's reflection pass spends ~40 draws on shots with no visible water** — `Water._visible` is a bbox test.
59. **The two menu nits the scrim blur revealed** — the Armiger gauge caption is dark-on-dark and wraps to *"on a / pad."*; the two-column screens leave the bottom ~35% empty.
60. **Prune `project/archive/handoff/`** — 90 files, nothing prunes it.

## O · The playtest — the human, not a lane

61. **Three 30-minute sessions, written steps, no instruction given.** The output is a ranked list of what felt broken, undiagnosed. **This is the only instrument that has ever found an input bug**, and it found one in about a minute.
62. **Round 18 after lanes A–F land**, same 20 pairs, same method — the before/after that says whether any of this moved the grade.

---

## Definition of done

- [ ] All 62 tasks landed or closed with a measured negative.
- [ ] `check` green, `nanscan` 0/142, both perf gates certifying.
- [ ] Tab under 800 MB, first load under 25 MB, idle under 30% of a core.
- [ ] A den lasts 18–30 s.
- [ ] Round 18 run and published, whatever it says.
- [ ] **This file is archived when the lanes report. No section may be added to it.**
