# FINAL FANTASY XV — Eos. Scope & Progress

**Started** 2026-08-16 22:13 · **Last updated** 2026-08-17 03:33 · **Elapsed ~5h20m**
**49 commits · 129 source files · ~37,300 lines**

Ambition: an action RPG in ThreeJS at the level of Final Fantasy XV (PS4, 2016) —
photoreal, fully playable, everything procedural (no asset files, no network).
Judged by harsh critic agents doing blind comparisons against the real game.

Legend: ✅ done · 🟡 in progress · 🔵 next up · ⬜ backlog · ❌ cut / not planned

---

## 0. Scoreboard

Harsh-critic scores, graded against *shipped* FFXV (not against improvement):

| axis | round 1 | round 3 | target |
|---|---|---|---|
| Environment / lighting | 6 | **7.5** | 9 |
| World dressing | 2 | **5** | 8 |
| UI | 7.5 | **8** | 8 (done — stop) |
| Combat VFX | 6.5 | **6.5** | 8 |
| Characters | 2 | **2.5 → 5.5**¹ | 8 |
| **Overall** | **3.5** | **4.5** | **8+** |

¹ characters re-rated 5.5/10 at gameplay distance after round 4; not yet re-scored by the overall critic.

**Performance — the current emergency.** Both benchmarks fail badly.

| metric | baseline | target |
|---|---|---|
| Posed shots (`tools/perf.mjs`) | 8–37 fps, mean 17.5 | ≥60 fps every shot |
| Gameplay (`tools/gameplay.mjs`) | worst segment 17.7 fps | ≥60 fps every segment |
| Hitches > 33 ms in a session | **773** | 0 |
| Worst single frame | **15,820 ms** (weapon swap) | < 20 ms |

---

## 1. Engine & infrastructure — ✅ mostly done

| item | state | notes |
|---|---|---|
| Vite + three 0.185, systems architecture | ✅ | `Game` orchestrator, ordered `init`/`update`/`lateUpdate` |
| Seeded RNG + simplex/fbm/ridged/worley/warp noise | ✅ | `src/util/` |
| Procedural PBR texture synthesis | ✅ | normal-from-height, cavity AO, sprites, blue noise |
| Screenshot harness | ✅ | `tools/shoot.mjs` — 15 shots, fixed timestep, exits non-zero on any console error |
| Contact sheet | ✅ | `tools/sheet.mjs` |
| **FPS benchmark (posed)** | ✅ | `tools/perf.mjs` — median/min/mean/p95, `gl.finish()` bracketed |
| **FPS benchmark (real gameplay)** | ✅ | `tools/gameplay.mjs` — 13 scripted input segments, per-segment percentiles + hitch log |
| Cost attribution | ✅ | `tools/attrib.mjs` — A/B/A per-subsystem |
| Production build verified | ✅ | `--prod` flag; fixed a minifier-only crash |
| Capture determinism | ✅ | visually stable (mean Δ 0.39/255); not bit-exact |
| Cloud raymarch upsample blockiness | 🔵 | visible at upper-left in `mesa_landmark` |
| Automated visual regression diffing | ⬜ | would catch silent quality regressions between merges |

## 2. Rendering & world — ✅ strongest area

| item | state | notes |
|---|---|---|
| Post chain: TAA, bokeh DOF, motion blur, mip-chain bloom, LUT grade, CAS | ✅ | auto-exposure entirely on GPU |
| Atmosphere: Rayleigh/Mie/ozone scattering, LUT driven | ✅ | sun colour taken from transmittance, not a ramp |
| Volumetric clouds, cloud shadows, god rays | ✅ | storm deck, silver lining, virga |
| Day/night + moon + starfield + milky way | ✅ | |
| Cascaded shadow maps (3) | ✅ | **but the dominant frame cost** |
| Terrain: 2048² field, hydraulic erosion, 7-level clipmap, 6-layer splat | ✅ | |
| Terrain strata frequency + silhouette variety | ✅ | 16-71 m beds → 3.5-14 m; benched mesas, fins, talus aprons |
| Vegetation: instanced grass, wind, LOD, trample | ✅ | rescaled to Leide-correct ankle height |
| Water: planar reflection | ✅ | wasteful — re-renders scene every frame |
| Weather: rain, wet surfaces, wind, lightning, valley fog | ✅ | |
| World dressing: megastructures, road furniture, wildlife, haven | ✅ | Imperial Citadel on the horizon |
| Props: fractured rock, Regalia interior, garula anatomy | ✅ | |
| Night/dusk key light (moon directional + sky hemi) | 🔵 | `haven_dusk` is "under-exposed mud with one hot spot" |
| Long cast shadows for characters | 🔵 | needs the CSM near cascade |
| **Multiple open-world regions** (Duscae, Cleigne) | ⬜ | one 3 km Leide basin exists |

## 3. Characters — 🟡 weakest visual area

| item | state | notes |
|---|---|---|
| 40-bone rig, procedural anatomy, garment layering | ✅ | skin and cloth cut from shared sweeps |
| Parametric gait, foot IK, companion formation AI | ✅ | |
| Armature proportions (7.77 heads, shoulders, neck) | ✅ | round 3 fixed the `armNodes()` bug behind the "wings" |
| Faces readable at gameplay distance | ✅ | round 4: contrast-preserving mips — 2.5 → 5.5/10 |
| Head sculpt (nose/chin), shadow-side torsos | 🔵 | named as the remaining gap |
| Hair as true layered locks | ⬜ | currently opaque ribbons with spikes |
| Character portraits in the UI | ⬜ | still generic silhouettes |

## 4. Combat — ✅ systems, ❌ encounter loop

| item | state | notes |
|---|---|---|
| Combos, dodge, phase/parry, blindside, link-strike | ✅ | |
| Warp-strike, warp-to-point, Stasis, Armiger | ✅ | |
| 5 weapon classes, crystal materialisation | ✅ | |
| Elemancy + VFX, GPU particles, trails, ground FX | ✅ | one draw call per system |
| 4 enemy types, one draw call each | ✅ | |
| **Encounters: aggro, victory, drops, EXP** | 🟡 | agent running — currently a photo booth |
| **Party companions actually fighting** | 🟡 | agent running — they never attack |
| **Player death / downed / game over** | 🟡 | agent running — HP floors at 0, nothing happens |
| **Bestiary expansion (~15 more species)** | 🟡 | agent running |
| **Boss fights + an Astral set piece (Titan)** | 🟡 | agent running |

## 5. RPG systems — ✅ built, 🟡 being connected

**5,765 lines written and, until now, entirely dead code** — only `Game.js` referenced it.
The HUD displayed hardcoded literals over a fully-implemented simulation.

| item | state | notes |
|---|---|---|
| Stats: level curve to 99, EXP banking, damage formula | ✅ | |
| Ascension grid: 106 nodes, 9 constellations | ✅ | UI drew a *fake* second grid |
| Inventory: 137 items, 37 weapons, 18 accessories | ✅ | |
| Elemancy: computed spellcrafting | ✅ | |
| Quests: 30 (7 chapters, 12 hunts, 11 side) | ✅ | coordinates are fictional, match no geometry |
| Party: 13 techniques, 30 recipes, bonds | ✅ | |
| DayCycle, havens, camping, saves | ✅ | |
| **Wiring RPG → UI → combat** | 🟡 | agent running — top priority |
| Camp / cook / rest loop | 🔵 | ~90% coded, needs the interaction verb |

## 6. Gameplay & content — 🟡 just started

| item | state | notes |
|---|---|---|
| **Interaction verb** (talk / shop / rest / drive) | 🟡 | agent running — nothing is pressable today |
| **Hammerhead**: garage, diner, pumps, caravan, sign | 🟡 | agent running — full build, not minimal |
| NPCs: Cindy, Cid, Takka, Dave + ambient civilians | 🟡 | agent running |
| Shops (all three) + hunt board (12 hunts) | 🟡 | agent running |
| **Manual driving of the Regalia** | 🟡 | agent running — suspension, weight transfer, gamepad |
| Auto-drive with Ignis | 🟡 | agent running |
| In-car party banter + radio | 🟡 | agent running |
| Fuel, night driving danger | 🟡 | agent running |
| **Dungeons**: Keycatrich, Balouve, Fociaugh | 🟡 | agent running |
| **Story: chapters, cutscenes, the opening push** | 🟡 | agent running |
| Title screen / main menu | 🟡 | agent running |
| Chocobos: riding, rental, racing | ⬜ | |
| Fishing | ⬜ | |
| Photo mode with Prompto's shots | ⬜ | UI screen exists, not wired |
| Astral summons beyond the Titan fight | ⬜ | |
| Altissia / Niflheim / late chapters | ❌ | out of scope |

## 7. Audio — 🟡

| item | state | notes |
|---|---|---|
| Procedural score, SFX, ambience bed | ✅ | thin; almost nothing triggers it |
| **Adaptive orchestral score + full SFX bank** | 🟡 | agent running |
| Combat events → sound | 🟡 | agent running — rich event stream, currently silent |
| Positional audio, bus mixing, ducking | 🟡 | agent running |

## 8. Performance — 🟡 critical

| item | state | notes |
|---|---|---|
| **Shader pre-warm** (programs climb 174 → 369 in a session) | 🟡 | agent running — cause of the 15.8 s freeze |
| Shadow cascade cost (83% of frame) | 🟡 | agent running |
| DOF at half res | 🟡 | agent running |
| Water reflection gating | 🟡 | agent running |
| Streaming hitches (755 ms map traverse) | 🟡 | agent running |
| Weather / day-night rebuild hitches (300–470 ms) | 🟡 | agent running |
| Menu open at 23 fps | 🔵 | likely `backdrop-filter` + per-frame DOM |
| Draw-call budget renegotiation | 🔵 | `BRIEF.md` says 400; unreachable with 3 cascades — propose ~2,500 |

---

## 9. Agents in flight (10)

| workstream | owns | status |
|---|---|---|
| Performance → 60 fps | `engine/**`, `Water.js`, Sky shadow cfg, `combat/{CombatSystem,Weapons}.js` | 🟡 |
| Terrain strata & silhouette | `world/Terrain.js`, `world/terrain/**` | 🟡 |
| Systems integration (the wire) | `ui/**`, `rpg/RpgSystem.js`, `game/Game.js`, `Player/Party.js` | 🟡 |
| Hammerhead & interaction | `world/town/**`, `characters/npc/**`, `game/interaction/**` | 🟡 |
| Regalia & road trip | `world/vehicle/**`, `props/Regalia.js`, `audio/Radio.js` | 🟡 |
| Encounters, bestiary, bosses | `game/encounters/**`, `characters/{Enemies,enemies,ai}` , `Director.js` | 🟡 |
| Dungeons & interiors | `world/dungeons/**` | 🟡 |
| Story, chapters, cutscenes | `game/story/**`, `game/cinematics/**` | 🟡 |
| Audio & music | `audio/**` (except `Radio.js`) | 🟡 |
| Design plan (`PLAN.md`) | — | ✅ delivered |

## 10. Notable bugs found and fixed

Kept because each was invisible until something specific was measured or looked at.

- **Production build crashed on load** — `Game.get()` matched on `constructor.name`, which the minifier mangles. Dev worked, `vite preview` didn't. The capture harness only ever tested dev.
- **RPG layer entirely unreferenced** — 5,765 lines ticking, read by nothing.
- **Prop albedo ~10× too dark** — `setHex(tint, SRGBColorSpace)` returns *linear*, then written into an sRGB-tagged texture and de-gamma'd twice. Magitek hulls rendered flat black.
- **Cloud raymarch ran for the water reflection camera** — marching rays *downward* through the water plane, which is why the storm had no sky.
- **Grass normals flattened** — three has no per-instance normal matrix; non-uniform blade scale divided the normal by column length. Cause of the "green cardboard" look.
- **Face features vanished at distance** — no contrast-preserving mip chain; sclera at the same albedo as the socket, so everyone read as squinting.
- **`NaN` HP on new characters** — `hp = maxHp` ran before `hpDrain` was assigned, and `maxHp` subtracts it.
- **Party roster showed Prompto twice** — companions merged by index into a table whose slot 0 is Noctis.
- **Vegetation used a road the terrain never carved** — `Ecology` probed for `terrain.roadCenterX` and silently fell back.
- **Boulders hanging off cliff faces** — sunk along −Y instead of the surface normal.
- **GTAO's `scene.overrideMaterial` discards alpha-test** — foliage stamped solid black rectangles into the AO buffer.
- **`HTMLCanvasElement` texture upload loses alpha** in this renderer path.

## 11. Working agreements

- Agents own **disjoint directories**; anything cross-boundary is reported, not edited.
- Every agent must **look at its own screenshots** and iterate ≥5 rounds.
- Critics grade against shipped FFXV, never against improvement.
- **Agents are not trusted blindly** — two have now correctly disproved critic claims by measuring
  (Ignis's rig was the *worst* proportioned, not the reference; hair geometry did exist).
- One system owns each global frame quantity (exposure, tone map, fog); others publish inputs.
