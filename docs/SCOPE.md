# FINAL FANTASY XV — Eos. Atomic scope checklist

Every discrete thing the game should contain, one line each, checkable.

> **Verified against `main` @ 421 commits, 2026-08-23.** The previous stamp was
> `main` @ 98 commits (2026-08-17) and the file had drifted 323 commits. It was
> wrong in **both** directions, and mostly in the direction nobody expects: it
> **understated** the game. Nineteen atoms marked not-started were shipped and
> reachable; a further eighteen are code that nothing in a played session can
> reach. The full account of what moved is in `project/handoff/inventory.md`.
>
> **342 atoms · 257 shipped · 18 built-but-unreachable · 67 not built.**
> Recount rather than quote — the command is below.

Taking over? Start with **[`project/STATUS.md`](../project/STATUS.md)**, then
**[`project/HANDOFF.md`](../project/HANDOFF.md)**.

## The three states, and why the middle one exists

| | means |
|---|---|
| `[x]` | **Shipped.** The code exists *and* a played session can reach it. |
| `[~]` | **Built, unreachable.** The code exists, compiles, is statically reachable from `main.ts`, and may even be exercised by the harness — but no input path in a played session gets to it. |
| `[ ]` | **Not built.** |

`[~]` is not "in progress" — that is `project/STATUS.md`'s genre, and it is not
this document's. It is a durable property of the code, and it exists because
this repo's most expensive single bug was **5,765 lines of RPG systems that were
constructed, ticked, and read by nothing** while the HUD drew invented literals
over them. `project/LANDMINES.md` states the rule this legend enforces:
**existence is not integration.** `src/tools/orphans.mts` proves a module is
reachable from `main.ts` — 283/283 are — and that is a *weaker* claim than `[x]`.
Every `[~]` below names the caller that is missing.

## How to re-verify

Do not trust this file, and do not trust the report of the agent that wrote a
line into it. Ask which probe was run.

```sh
grep -c '^- \[x\]' docs/SCOPE.md   # shipped and reachable
grep -c '^- \[~\]' docs/SCOPE.md   # built, unreachable
grep -c '^- \[ \]' docs/SCOPE.md   # not built
```

- **A count in this file is a count of a live table.** Every one below was
  re-derived by counting the array, not by reading the previous number. They
  move; re-count them rather than quoting them.
- **Reachability is a grep for the caller**, not a grep for the definition. Three
  of the corrections this pass made were features whose *only* caller was the
  screenshot harness or a gate.
- Anything reading cannot settle is marked ***unverified*** in the line itself,
  with the probe that would settle it. A line marked unverified is worth more
  than a confident wrong one; this repo has been burned by the latter repeatedly.

Companion docs: `docs/WORLDMAP.md` (cartography, verified the same day) ·
`docs/reference/` (what shipped FFXV measures — external, frozen) ·
`docs/plans/` (live proposals) · `BRIEF.md` (engineering + art contract).
`project/LANDMINES.md` carries the bug log this file used to.

---

## 1. World map & zones

### 1.1 Cartography
- [x] Authored world map design (`docs/WORLDMAP.md`) — not noise-grown terrain
- [x] `WorldMap.ts` as single source of truth: zones, POIs, road graph, biome params
- [x] Zone query API — `zoneAt`, `zoneWeights`, `biomeAt`, `regionAt`, `nearestPOI`, `poiById`, `discover`, `discoverAround`, `travel`, `roadGraph`
- [x] Terrain generated *from* the map design rather than decorated after the fact — `Field.ts` imports `worldMap` and `LANDFORMS`
- [x] World substantially larger than the old 3 km basin — **8192 × 8192 m playable**, plus a 1024² frontier grid at 32 m cells out to ±16 km (32.8 km of *drawn* terrain)
- [~] Streaming/paging — **props, vegetation and POI kits all stream** (`props/TileStream.ts`, `Vegetation.converge()`, `PoiKits` one build per frame). The **terrain heightfield does not**: one 2048² field resident at boot under a camera-centred clipmap. A larger world needs the field streamed.
- [ ] Zone transitions with area title cards — the `areaTitle` primitive ships (`ScreenFX.ts`) and fires for the town, camp, quests and day change; **nothing fires it on a zone crossing**

### 1.2 Named zones — 19 zones across 3 regions

Regions are a *narrative* grouping (`REGIONS`); terrain is driven by zones
(`ZONES`). Level bands below are the region's, from the code.

- [x] **Leide** — badlands, red ochre, **levels 1–15**. 7 zones: Longwythe · The Three Valleys · Ostium Gorge (`crown_verge`) · Vannath Coast (`kelbass`) · Galdin Coast · Keycatrich · The Callaegh Steps (`balouve`)
- [x] **Duscae** — humid green, lakes, **levels 15–35**. 6 zones: Alstor Slough · The Malacchi Hills (`weaverwilds`) · The Nebulawood · Mencemoor (`cauthess`, the Disc) · Taelpar Crag · The Fallgrove
- [x] **Cleigne** — **levels 35–60**. 6 zones: The Lestallum Shelf · Malmalam Thicket · The Vesperpool · The Rock of Ravatogh · Pallareth Pass (`meldacio`) · Cape Caem
- [x] **A zone's id and its display name differ for seven of the nineteen** — the parenthesised ids above, plus `lestallum_shelf` → `zone_lestallum`. Shot names in `src/game/Shots.ts` follow the *display name*, so grepping `zone_<id>` makes those seven look uncovered when all nineteen have a shot (`zone_weaverwilds` is captured as `zone_malacchi`). `STATUS.md` carried that false gap for weeks. `Shots.ts:383-396` states the rule at the site but lists only six of the seven pairs. Full table in `docs/WORLDMAP.md` §8.
- [ ] Longwythe / Prairie Outpost / Wiz Chocobo Post country as *sub-regions* — Longwythe is a zone; **Prairie Outpost and Wiz Chocobo Post are POIs**, not zones or sub-regions. There is no sub-region concept in the data.
- [ ] Altissia — cut, out of scope
- [ ] Niflheim / Gralea — cut, out of scope

### 1.3 Points of interest

`[x]` here means **placed in `WorldMap.ts` with coordinates, type and gating**,
discoverable on the map, **and given built geometry**. That last clause is new:
`src/world/props/PoiKits.ts` builds a per-type kit for **every POI except
Hammerhead** (which `SKIP_IDS` hands to `world/town/`), streamed nearest-first.
The old wording — "only Hammerhead is built, the rest are markers on real
ground" — has been false since PoiKits landed.

- [x] **124 POIs** with name, type, coordinates, discovery radius, purpose, level and gating
- [x] Type breakdown, counted: **23** parking · **23** landmark · **17** haven · **11** dungeon · **10** royal tomb · **10** fishing · **8** outpost · **8** menace lair · **6** imperial base · **3** town · **3** rest stop · **2** chocobo post
- [x] Built kit geometry for **12 of 12 POI types** — 123 POIs, streamed with per-type cull distances (`PoiKits.ts:239-250`)
- [x] Haven — rune platform, campfire, tent; 17 placed, each with a working Camp prompt
- [x] Abandoned outpost · wrecked truck · water tower · comms relay mast (`props/Outposts.ts`, sited by `Ecology._layoutSites`)
- [x] Ruined obelisks — exactly 3
- [x] Crashed magitek dropship, with a smoke plume
- [x] Horizon landmarks at 1–4.5 km, shadow-exempt: Solheim viaduct · Meteor of the Disc · Niflheim dreadnought · imperial capital skyline (`props/Megastructures.ts`)
- [x] Hammerhead — **built by hand**: garage, Crow's Nest diner, fuel canopy, caravan, pylon sign, parts yard, 11 NPCs
- [x] Longwythe Rest Area · Galdin Quay · Lestallum · Old Lestallum · Cape Caem · Meldacio Hunter HQ · Coernix Stations · chocobo posts · fishing spots · royal tombs · imperial bases · parking spots

### 1.4 Road network
- [x] Carved highway spline with camber, ruts, berms — the terrain is cut for the road, not the road drawn on the terrain
- [x] Road furniture: delineators, crash barrier, distance markers, culvert headwalls, gravel shoulder, skid marks, generated by an arc-length walk of the graph
- [x] Telegraph poles with a sagging catenary cable
- [x] Real road *graph* — **19 routes, 50 junctions, 50 edges, 30.26 km** (highway 8.89 · road 11.90 · dirt track 9.47)
- [x] Car-friendly grades and corner radii — worst grade 13.0% against a 13% limit; tightest sustained corner 70 m against a 24 m limit
- [x] Every drivable POI reachable by road — **39 drivable, 0 unreachable**
- [x] 18 dead ends, 18 carved turning circles
- [x] Drivability assertion test — `src/tools/roadcheck.mts`, **0 failures, 0 warnings**
- [ ] Bridges over canyons/water — **nothing is built**. The Taelpar crossing is a carved neck between two 235 m walls; `n_taelpar_bridge` is a node name with no geometry behind it.
- [ ] Tunnels
- [ ] The `trail` road class is declared with a full profile (`RoadGraph.ts:60`) and **no route uses it**

### 1.5 Minimap & world map
- [x] Minimap — baked relief chart shared with the atlas, roads, glyphs, compass, live fog reveal. Its **0.5–0.7 ms/frame is *unverified*** — probe: load `?debug` and read `game.get('Minimap').cost`.
- [x] World map screen — hillshaded relief, road hierarchy, zone borders, **10** filters, POI card, region labels
- [x] Distance + estimated travel time, in four modes (drive / walk / sprint / chocobo)
- [x] **Fast travel** — `WorldMapScreen.accept()` sets the player position from the POI, snaps to `Terrain.heightAt`, zeroes velocity and closes the menu; reached on Enter/Space/pad-A, gated on `travel: true` (49 POIs) and discovery. *The old "destination jump not wired" was stale by months.*
- [ ] Fast travel moves **only the player** — the party and the Regalia stay behind, and nothing charges time or gil
- [ ] Map discovery / fog persistence in saves — `FogOfWar` has no serialiser and `SaveData` has no map field; `worldMap.discovered` reseeds to Hammerhead every boot

---

## 2. Terrain & environment

- [x] 2048² heightfield at 4 m cells, hydraulic erosion (**620,000 droplets**, 44 steps), flow map packed into the control texture
- [x] 7-level geometry clipmap (`n: 48`, `cell0: 1.5`), crack-free, pop-free
- [x] 6 procedural PBR layers — sand, dirt, gravel, rock, grass, road — height-blended splatting
- [x] Triplanar rock with sedimentary banding
- [x] Fine strata — 0.070–0.285 cycles/m, i.e. a **3.5–14 m bed repeat**; reads as *distant*, not merely large
- [x] Silhouette variety from **48 authored landforms** across 10 kinds: 12 fin (hogback) · 10 basin · 9 mesa · 5 butte · 5 terrace · 2 canyon · 2 spire · crater · peak · volcano. Benches and talus aprons are generated on top of them. *(The old list said "saddles"; there is no saddle feature anywhere in the code.)*
- [x] Near-field detail (2–4 m triplanar), gravel, cracking, scour
- [x] De-tiled rock faces — per-massif scale and identity, domain warp, stochastic tap
- [x] Road carving with wheel ruts encoded in the control texture and decoded in the fragment shader
- [x] `heightAt` · `normalAt` · `slopeAt` · `sampleMaterial` · `roadDistance` · `roadCenterX` · `moistureAt` · `zoneAt`
- [x] **The drawn-surface API** — `drawnHeightAt(x,z,cell)` (the height the clipmap lattice actually displaces to, not the true field), `seatHeightAt` (lowest surface any ring would rasterise — for seating props so they never float), `drawnEnvelope` (the highest, for aprons and decals), `clipSpacingAt` / `clipSpacingForDistance`. Gated by `src/tools/seatcheck.mts` at **0.000 m residual from 60 m to 3.4 km**.
- [x] **Baked horizon angles** (`world/terrain/Horizon.ts`) — a convex-hull line sweep over the far grid gives the max terrain elevation angle in 8 azimuth bins, stored as `sin(angle)` in two RGBA8 layers and injected into the terrain shader. Buys kilometre-scale terrain self-shadowing plus sky AO for one texture unit and two fetches. Gated by `src/tools/horizoncheck.mts` (MCC ≥ 0.85 against a brute-force ray march).
- [x] **Per-zone surface palette** (`world/terrain/Biome.ts`) — 19 zone entries baked to a LUT and blended by the map's Gaussian zone weights. This is what stops 8 km of world reading as one Leide badland.
- [x] **Baked heightfield pipeline** — `terrain/FieldBake.ts` + `FieldCodec.ts` encode/decode `baked/terrain.bin.gz`, produced by `src/tools/bake.mts` and loaded at `Terrain.init`
- [x] Water — planar reflection, waves, fresnel, sun glint, foam, and a **Beer-Lambert depth model** (`vec3 T = exp(-uSigma * path)`, per-channel extinction, metric depth read from the heightfield). Up to **4** lake/sea bodies, discovered automatically by basin flood-fill below −6.5 m.
- [ ] Rivers and waterfalls — named in map data only; no flowing-water geometry or shader
- [ ] Caves as terrain features (distinct from dungeon interiors)
- [ ] Snow surfaces — absent. **Volcanic is a palette tint, not a distinct surface layer**: `LAYER_NAMES` is the six above, and Ravatogh's black is `Biome.ts`.

---

## 3. Sky, weather & lighting

- [x] Rayleigh/Mie/ozone scattering, GPU-baked 256×64 transmittance and 256×128 sky-view LUTs
- [x] Sun colour derived from the transmittance readback and applied to the cascade lights
- [x] Volumetric clouds — Nubis shape/erode, normalised dual-lobe HG phase, silver lining
- [x] Cloud shadows on terrain — 512² shadow RT, consumed by every lit material through `sky/MaterialPatch.ts`
- [x] Cirrus layer
- [x] God rays / light shafts, inserted into the composer in `lateUpdate`
- [x] Aerial perspective (Rayleigh + sun-confined Mie lobe) — `scene.fog` is deliberately nulled in favour of it
- [x] Height fog / valley fog pooling — a world-ceiling slab with lowland weighting
- [x] Day/night cycle with `setTimeOfDay`
- [x] Starfield (3 layers + galactic band), moon with phase, and the moon becoming the key light at night
- [x] 3-cascade shadow maps with per-cascade refresh strides
- [x] PMREM environment probe from the sky
- [x] Weather presets — clear / overcast / storm / fog, every field lerped toward target
- [x] Rain — GPU streaks, 3 parallax shells, splash rings, **2 draw calls**
- [x] Wet surfaces — albedo darkening, roughness ×(1−0.62w), puddles grown in the terrain flow map
- [x] Lightning with a speed-of-sound thunder delay and real scene relight
- [x] Blowing dust, squall curtains, scud — all four carried by one composite volumetric pass (`weather/VolumePass.ts`)
- [x] Wind vector with gusts driving vegetation
- [x] Cloud raymarch upsample blockiness — sub-texel Halton jitter, TAA resolves it
- [ ] Night/dusk key light — exposure work has landed (night EV trim, a 12.0→3.4 exposure ceiling, lifted env fill, the moon as key). Whether `haven_dusk` still reads as mud is a ***unverified*** pixel judgement — probe: `node src/tools/shoot.mts haven_dusk --jpeg` and look at it.
- [ ] Rainbows, auroras, meteor showers

---

## 4. Vegetation & props

- [x] Instanced grass, **3 LOD rings** (blade 0–26 m, clump 21–84 m, far 78–155 m), tile-streamed against a wall-clock budget
- [x] Leide-correct blade scale in tufts (≤22 blades per clump), dry olive/straw. *The "0.15–0.35 m" is the file's stated intent; the height law admits ≈0.06–0.48 m and the file's own second comment says mean 0.157 m.*
- [x] Wind: travelling gust front with a beating cross-wave, plus per-instance flutter
- [x] Trample/clearance for up to **10** actors, distance-sorted (player, party, enemies)
- [x] Bushes and scrub
- [x] Trees — **7 species** (dead, savanna, conifer, broadleaf, duscae, thicket, swamp), recursive branching, impostors baked from the built geometry at 256 px
- [x] Backlit leaf translucency, tiered near → impostor → stand card
- [x] Rocks — fracture-plane geology, **8 kinds** (granite, bedded, worn, slab, spire, talus, cobble, pebble), split normals, clustered anchor+fragment scatter, per-zone weighting
- [x] Debris scatter — **12 kinds**: branch, log, stump, leaves, bones, planks, rubble, driftwood, dead trunk, cairn, barrel, reeds
- [x] Wildlife — raptor kettles on thermals, garula herds (~80 head in one instanced draw), **wading egrets and herons at waterlines**, dawn/dusk midge swarms, and a smoke layer; density per zone from `ZoneDress`
- [x] **Grass casts shadows through a proxy** — two crossed quads per *tuft* (4 triangles), invisible in the colour pass, `castShadow` only, blade ring only, taller half of tufts only. Individual blades deliberately cast nothing: they are below the cascade's resolving power.
- [x] **19 per-zone vegetation profiles** (`veg/Biomes.ts`) — grass density, height, dead fraction, tree tints
- [x] **Prop infrastructure** SCOPE has never listed: `props/TileStream.ts` (camera-relative deterministic cell streamer), `props/ZoneDress.ts` (per-zone scatter recipes for all 19 zones), `props/PartBuilder.ts` (one merged mesh per material — the reason the prop draw-call budget holds), `props/PropMaterials.ts` (shared procedural PBR sets), `props/CreatureGeo.ts` (swept-tube sculpting + vertex-shader rig for ambient animals), `props/Landmarks.ts`, `props/Outposts.ts`, `props/RoadFurniture.ts`
- [x] **`props/EcoSites.ts`** — a types-only module (16 site types) declaring the contract `Ecology._layoutSites()` publishes to Props, Landmarks, Outposts, Wildlife, Town, Regalia and Story
- [ ] More fauna: sabertusk packs roaming the open world, birds landing and taking off, fish
- [ ] Destructible / interactive props — props are merged static geometry; collision is derived read-only
- [ ] Harvestable ingredient nodes — *note `world/collision/Harvest.ts` is unrelated: it harvests the scene graph into collision proxies*

---

## 5. Characters

- [x] **40-bone** humanoid rig (16 centre + 12 mirrored) with spring bones for tail and coat
- [x] Shared anatomy sweeps — skin and cloth from one source
- [x] Procedural faces with eye geometry, sockets, brow ridge, lids and lash ribbons
- [x] Contrast-preserving hand-built mip chain so features survive at distance
- [x] Subsurface-ish skin with a per-vertex thickness channel
- [x] Kajiya-Kay hair with strand tangents
- [x] Layered garments: jacket, collar, hem, belts, straps, boots
- [x] Noctis, Gladiolus, Ignis, Prompto — four authored profiles, identity-distinct
- [x] Parametric gait blending idle→walk→jog→sprint, no baked clips
- [x] Two-bone foot IK with ankle-to-slope alignment
- [x] Companion formation AI with slot keeping, separation and glances
- [x] Contact shadows / grounding, both per-character and as a post pass
- [x] **Ambient procedural blinks** — deterministic 2.4–6.0 s spacing, driven on the lid bones
- [x] **Equipped weapons are visually reflected** — `CombatSystem.weaponSlots()` reads `rpg.inventory.equipped('noctis').weapon` and `drawSlot()` swaps the mesh, with a crystal materialise
- [x] A second, separate character pipeline for townsfolk — `characters/npc/{NpcCast,NpcRig,NpcDialogue,Npcs}.ts`
- [ ] The stated proportions (7.77 heads, 2.84 shoulder widths, legs 49.3%) ***are not in the code and do not reproduce from it***. Measured from `Skeleton.ts`: **7.44 heads**, height ÷ biacromial **5.06**, hip height **51.4%** of stature. Either the numbers or the rig moved; nothing records which. Probe: recompute from `Skeleton.ts:126-129,196-206` and decide which is the target.
- [ ] Head sculpt pass — nose/chin, shadow-side torsos. ***Unverified*** by reading; probe: `src/tools/framecam.mts` at 0.4–0.6 m, per `LANDMINES.md`.
- [ ] Hair as true layered locks rather than opaque ribbons
- [ ] Facial animation beyond blinks — no dialogue trigger, no expression layer, and **the `jaw` bone exists and is never written**, so no lip sync
- [ ] Character portraits in the UI — `Icons.portrait()` draws a procedural lit silhouette
- [ ] Climbing / vaulting / ledge traversal — the only "vault" is a dodge-roll variant
- [ ] Swimming
- [ ] Outfit changes at runtime — outfits are authored once in `Cast.ts`; there is no `setOutfit`

---

## 6. Combat

### 6.1 Core
- [x] Hold-to-attack auto-combo chains, per weapon class (5 classes: sword, greatsword, polearm, daggers, firearm)
- [x] Dodge roll with i-frames (0.32 s)
- [x] Hold-to-phase (MP-draining parry) with a slow-mo counter window
- [x] Blindside attacks, feeding the real damage formula's back-attack term
- [x] Link-strikes on combo finishers
- [x] Warp-strike
- [x] Warp-to-point repositioning
- [x] Stasis (MP-zero recovery state)
- [x] Armiger burst with 8–13 orbiting phantom royal arms
- [x] Hitstop on impact
- [x] **Heavy attack** as a distinct verb, and **counter/riposte** distinct from the parry
- [x] Four-slot weapon quick-swap from the real inventory (Digit1-4 / d-pad)
- [x] Lock-on **reticle** — `CombatSystem.setLockOn` drives the HUD nameplate and reticle
- [~] Lock-on **camera framing** — `CameraRig.setLockOn` exists and **has no caller anywhere in `src/`**, so `CameraRig.lockOn` has been `null` since it was written and the combat-framing block in `lateUpdate` has never executed. The file says so at `CameraRig.ts:71-73`.
- [~] Aerial combat bonus — `CombatSystem` accepts `aerial` and forwards `isAerial` to the formula; **nothing ever passes `true`**
- [ ] Wait Mode
- [ ] Royal Arms with HP-cost drawback — the ten tombs are POIs and the name appears in `ArmigerScreen`; there is no HP-cost mechanic
- [ ] Weapon durability / upgrade paths

### 6.2 Damage & progression model
- [x] Physical/magical damage formula with defence mitigation
- [x] Elemental resolve — absorb (<0), immune (=0), resist (<100), weak (>100)
- [x] Weapon-class weakness bonuses
- [x] Stagger multipliers, back and warp bonuses, crits
- [x] Per-species super-armour, poise and stagger duration
- [x] Night daemon scaling, with night depth pushed to the enemies
- [x] Damage numbers driven by the real formula — `CombatSystem.resolve` calls `rpg.damage()` at source and the HUD prints the event value

### 6.3 Encounters
- [x] Roaming groups with territories and patrol routes
- [x] Sight cones (1.9 rad half-angle), hearing (12 m), aggro/de-aggro with a 44 m leash
- [x] Group coordination — `engage`/`flank` pack roles, with an engagement budget of 2–3 so the player is never mobbed
- [x] Combat start/end state driving both the HUD and the score
- [x] Victory: EXP, AP, gil, item drops
- [x] Party companions actually attacking
- [x] **12 techniques**, four per companion: Gladio — Tempest, Impulse, Dawnhammer, Coverage · Ignis — Analyse, Enhancement, Regroup, Overwhelm · Prompto — Piercer, Recoil, Starshell, Gravisphere. *"Royal Guard" and "Trigger-Happy" were listed here and **do not exist**. §8's "13" counts `PartyState`'s table, which adds a non-`Tech` Armiger pseudo-entry.*
- [x] **Analyse** publishes bestiary weaknesses onto the target (`enemy.analysed`) — a scan mechanic in its own right
- [x] **Gladio's Coverage taunt** — an aggro-redirect timer on `Party`
- [x] Tech bar charging
- [x] Player downed state with bleed-out and ally revive
- [x] Game over and retry
- [x] Ambushes — roaming packs that spawn already aware
- [x] Enemies asleep at night / daemons that have not yet risen
- [ ] Enemy reinforcements — `_rollRoamer` is gated off while `state === 'combat'` and nothing else adds enemies to a live fight
- [ ] Summons / Astral invocation conditions

### 6.4 Bestiary — 21 species, 23 registry keys, 20 spawnable

`Bestiary.ts` registers 21 species files plus two `variant()` re-stats.
`SpawnTables.ts` decides which of those a played session ever meets.

- [x] Spawnable in play (20): Sabertusk · Goblin · Imperial MT Trooper · Iron Giant · Dualhorn · Voretooth · Garula · Anak · Coeurl · Bandersnatch · Mesmenir · Arachne · Ronin · Imperial Axeman · Imperial Sniper · Bussemand · Hobgoblin · Necromancer · Red Giant · **Titan** (as the "Adamantoise" hunt mark)
- [x] Named hunt marks re-stat and re-name base species — "Zu", "Naga", "Garulessa", "Adamantoise" (`HuntRuntime` + `Bestiary.variant`)
- [x] The shared procedural creature pipeline behind all 21 — `enemies/{RigBuilder,Biped,Quadruped,Palette}.ts`
- [~] **Magitek Armour** — fully built, and reachable only through `SET_PIECES`, which nothing triggers (see 6.5)
- [~] **Bloodhorn** — same: a `variant()` of Dualhorn, set-piece-only
- [~] **Deadeye** — a Behemoth reskinned from the Bandersnatch, 34,000 HP, `boss: true`. **Nothing spawns it.** Quest `main_ch3_deadeye` requires killing it, so **chapter 3 cannot be completed**. This is a defect, not a scope gap.
- [ ] Zu as a distinct species — the hunt mark named "Zu" is a renamed Bandersnatch
- [ ] Malboro
- [ ] Cactuar / Tonberry

### 6.5 Bosses — the set-piece path is written and unreachable

`BossFight` is constructed in exactly one place (`EncounterDirector.startSetPiece`),
which is called from exactly one place (`HuntRuntime.arm`, guarded by
`if (t.setPiece)`). **No entry in `HUNT_TARGETS` sets `setPiece`.** So the phase
machine never runs — not in play, and not in the capture harness either:
`Director._bossScenario` spawns the enemy directly and freezes it.

- [x] **Dropship arrival** — genuinely reachable. `EncounterDirector` constructs, inits and ticks it, and the `imperial_drop` roamer (weight 2, any time) calls `dropship.arrive()`. Its approach/hover/drop/depart machine runs in play.
- [~] Field boss (Behemoth-class) — `SET_PIECES.bloodhorn` and the whole phase machine exist and are unreachable. *Also mis-worded: `bloodhorn` is a Dualhorn variant; the Behemoth-class beast is `deadeye`.*
- [~] Imperial set piece (MA-X Cuirass) — `SET_PIECES.magitek_armour`, unreachable
- [~] Astral-scale fight (Titan) — `TitanArena.ts` (merged-mesh basalt arena, quake, rising spires, boundary) is complete and ticked from `BossFight.update`, which never starts
- [~] `BossFight.resolveStrike` / `slamAt` / `_handPos` — `Enemies.onStrike` routes to `EncounterDirector.resolveStrike`, an arc sweep off the enemy root, so **Titan's forty-metre fist has never landed where the hand is**. Now doubly dead. (`LANDMINES.md` recorded this; re-verified on this tree.)
- [~] `SetPiece.music` — none of `boss-field` / `boss-imperial` / `boss-astral` is in the score's state table and nothing listens for `encounter:boss`
- [ ] Ramuh / Leviathan / Shiva / Ifrit

### 6.6 Magic
- [x] Elemancy crafting model — energy + catalyst → computed spell
- [x] Tiers (Fira/Firaga), Dual/Tri/Quad/Quintcast, Healcast, Expericast
- [x] Fire / ice / lightning VFX with real light emission
- [x] Elemental reactions (steam, conduction, firestorm), surfaced on the `spell` event
- [x] **Elemental deposits — 12, world-anchored to real POIs** via `WorldMap.poiById`. Drawing is wired (`T` → `drawEnergy` → `RpgSystem.drawNearby`, 12 m), with VFX, a `draw` event and compass markers.
- [x] Enemy status effects and instant-death rolls from crafted-spell catalysts
- [~] **Crafting has no in-game entry point.** `RpgSystem.craftSpell` is called only from `src/tools/combatloop.mts`; no screen imports Elemancy. The quest objective "Craft your first spell" is therefore uncompletable.
- [ ] Deposits have no visible geometry — nothing in `src/world/**` draws one
- [ ] Ring of the Lucii

---

## 7. VFX

- [x] GPU particle system, analytic motion integrated in the vertex shader
- [x] Soft particles with depth fade
- [x] Weapon trail ribbons, pooled per swing
- [x] Warp shard burst, dash streak, impact shockwave
- [x] Crystal materialisation dissolve, driven by draw/sheathe
- [x] Ground FX: scorch, cracks, frost, rings — vertices snapped to `Terrain.heightAt` so they conform
- [x] **8-light pool for VFX**, permanently resident, priority-stolen. *The scene-wide budget is a different system: `LightBudget` pins visible point+spot counts per quality tier at 6/8/10/12 point + 2 spot, because toggling a light's `visible` recompiles 43 programs — a measured 9.5 s freeze.*
- [x] `combat/Beams.ts` — camera-facing polyline ribbons with per-channel chromatic dispersion (dash streaks, lightning arcs, magic beams)
- [x] `combat/VfxTextures.ts` — 12 procedurally generated sprites and decals
- [x] `combat/CrystalShards.ts` — a dedicated 420-capacity instanced shard system
- [x] `combat/GeoKit.ts` — procedural geometry kit merging weapons and creatures into single draw calls with per-part vertex albedo/emissive
- [ ] Screen-space distortion / heat haze
- [ ] Blood/impact decals persisting on surfaces — blood is particles only; impact/scorch/crack/frost decals exist but are a 12-slot pool with a 22–40 s life, terrain only. `VfxTextures.blobDecal()` ("blood pools") has **zero callers**.

---

## 8. RPG systems

- [x] Stats: 6 core, level curve to 99, **24,224,330** total EXP (the file's own header says ~26M and is the wrong number)
- [x] EXP banking, redeemed on rest against a **9-entry lodging table**, ×1.0–×3.0
- [x] Ascension grid: **106 nodes, 9 constellations, 5,655 AP** — all three counted
- [x] AP earning rules with per-rule cooldowns and distance accrual — warp-strikes, parries, staggers, link-strikes, quests, camping, cooking, driving
- [x] Inventory: **137 items** (14 curative · 17 catalyst · 12 treasure · 30 ingredient · 9 key · **37 weapons** · **18 accessories**), per-character slot layout and class permissions
- [x] Elemancy crafting model (but see §6.6 — no in-game door to it)
- [x] Quests: **30 authored — 7 main, 12 hunt, 11 side**
- [x] Party: **13 entries** in `PartyState.TECHNIQUES` (12 real techniques + an Armiger pseudo-entry), **6 bond levels**
- [x] Cooking: **30 recipes** with timed buffs and Ignis's cooking level gate
- [x] DayCycle: **8 phases**, daemon pressure, havens derived from `WorldMap`, camping
- [x] SaveGame — `SAVE_VERSION = 3`, migration, **multi-slot with `listSaves()`**, reachable from `SystemScreen`
- [x] **Wired to the UI and combat.** `ui/GameData.ts` is the single door from `src/ui` to `src/game/rpg`; `CombatBridge.attach` subscribes to damage/death/warp/parry/stagger/link/playerHit.
- [x] Ascension screen renders the real 106-node graph and spends real AP
- [x] Inventory/gear screens read the real tables
- [x] **Quest coordinates come from `WorldMap`.** Every waypoint goes through `at(poiId)` → `worldMap.poiById`, which *throws* on an unknown id; there are 44 such calls and **zero literal coordinate pairs** in the quest table. The same is true of havens and elemancy deposits. *Formerly listed as not-started.*
- [x] **Shops trade against the real gil economy** — `ShopScreen` calls `inventory.buy/sell`, which move real gil against `ItemDef` prices. *Formerly listed as not-started.*
- [x] `game/rpg/Emitter.ts` — the synchronous pub/sub bus every RPG subsystem shares, with a 64-entry ring log for the debug overlay. *Its own docstring claims "no wildcards" and the `emit` comment three lines down admits that is wrong.*
- [x] 6 tipsters with ledgers, and 8 hunt star-ranks with gil multipliers 1.0→40.0
- [~] `Inventory.SHOPS` — a **second** 5-outpost shop stock table exposed as `rpg.tables.shops` and read by nothing; the shop screen uses `world/town/Shops.ts`
- [ ] Hunter rank progression — points accrue per hunt and gate which bounties are takeable, but the 7-rung ladder lives in `HuntBoardScreen` rather than in `game/rpg/`, so it is neither saved nor simulated, and none of its rewards is ever granted
- [ ] Tomes / bestiary completion rewards — the bestiary itself ships (`ArchiveScreen` over `Bestiary` + `KillLog`); no completion reward of any kind exists
- [ ] Regional price variation / stock gating

---

## 9. Gameplay loop & content

### 9.1 Interaction
- [x] Interaction verb — proximity + facing, contextual prompt, hysteresis
- [x] Nine verbs registered in play: **Talk · Shop · Hunts · Rest · Refuel · Drive · Read · Camp** (17 havens) **· Open/Unlock** (dungeon interiors only)
- [ ] Examine / pick up world items — nothing outside a dungeon chest adds to the inventory
- [ ] Doors and gates in the world — a full door prop with a locked/keyed variant exists in `dungeons/kit/InteriorProps.ts`, reachable only inside a dungeon, which itself cannot be entered (see 9.7)

### 9.2 Towns & NPCs
- [x] Hammerhead: garage, Crow's Nest diner, fuel canopy, caravan, pylon sign, parts yard
- [x] Night floodlights on a day/night ramp
- [x] Cindy, Cid, Takka, Dave — the four talkable NPCs (`talkRadius` is set only on them)
- [x] 7 more ambient civilians with walking routes and behaviours — **11 NPCs total**
- [x] Multi-exchange dialogue with branching (`choices` / `when` nodes)
- [ ] Other settlements — `PoiKits` builds town/outpost/rest-stop *geometry* everywhere, but no other place has NPCs, shops, interactables or interiors

### 9.3 Shops & economy
- [x] Takka's diner — provisions plus 16 ingredients feeding the 30 recipes
- [x] Garage general store (curatives, catalysts)
- [x] Weapon & accessory counter, filtered to exclude royal arms
- [x] Buy and sell with real prices, per-counter sell-back category lists
- [ ] Regional price variation / stock gating

### 9.4 Quests
- [x] Main chapter sequencing with objective handoff — 7 main quests, chapter advance on completion
- [x] Hunt board with 12 hunts, ranks, 6 tipsters, rewards
- [x] Accepting a hunt spawns its target (`HuntRuntime.arm` → 12 `HUNT_TARGETS`)
- [x] **11 side quests with multi-step objectives and real world waypoints**, acceptable from the quest log. *Formerly listed as not-started.*
- [x] **Quest log screen** — `ui/screens/QuestScreen.ts`, registered, reachable from the pause menu, with quest tracking that drives the compass strip. *Formerly listed as not-started.*
- [x] Objective types that are wired: `kill`, `reach`, `talk`, `cook`, `rest`, `draw`, `craft`, `quest`
- [ ] `fetch` fires from exactly one hard-coded dialogue line; `Inventory.add` does not notify the log
- [ ] `escort`, `photo` and `fish` objective types are declared and **never notified**, so quests carrying them cannot complete

### 9.5 Camp & rest — four of the five old boxes were stale
- [x] **Camping at havens** — a `Camp` prompt at all 17, installed on the first tick that finds `Interaction`; asserted by `integration.mts` (camping at a haven advances the day, camping 400 m away is refused)
- [x] **Meal selection with Ignis's cooking level** — a 5-item camp menu over `party.cookableNow()`, cooking through `rpg.camp({recipe})`
- [x] **EXP banking on rest**, and **caravan / lodging rest with multipliers** — the caravan costs gil and quotes ×1.2; asserted by `integration.mts` (the bank drains and the level rises)
- [x] "Wait until morning" at a haven — a time skip without sleeping
- [x] Meal buffs apply on waking rather than before sleep, and expire overnight
- [ ] An animated camp *scene* — the camp is a dialogue, not a staged cutscene with an Ignis actor
- [ ] Prompto's photos reviewed at camp

### 9.6 Traversal
- [x] Manual driving of the Regalia — suspension, weight transfer, grip
- [x] Auto-drive to a waypoint — but **the destination is chosen by code at init**; the player cannot pick one, and the map is not hooked up to it
- [x] Drive camera (chase, cinematic, bonnet)
- [x] Enter/exit with all four seated
- [x] In-car party banter, context-triggered
- [x] The radio — 6 procedurally synthesised stations, with dialogue ducking
- [x] Fuel consumption and refuelling, against a fuel-station registry
- [x] **Fast travel** — see §1.5. Wired; player-only, no cost, no fade.
- [~] Night driving danger — `RegaliaSystem.nightDanger()` **has no callers**. Night pressure exists, but globally through `EncounterDirector`, not as a driving hazard.
- [ ] Regalia Type-F flight
- [ ] Car customisation / decals
- [ ] Chocobo riding / rental / racing — chocobo POIs, a map filter, a travel estimate and a "CLOSED" Rent-a-Bird notice; no mount

### 9.7 Dungeons
- [x] Dungeon system: room graph, critical path, side branches, boss chamber
- [x] Interior lighting (the sun does not leak in)
- [x] Keycatrich Trench · Balouve Mines · Fociaugh Hollow — 3 built
- [x] Treasure, hazards, locked doors, and key items carried between dungeons
- [x] Wall confinement and door body-blocking for the player and the party
- [~] **World entrances.** The geometry is built and placed and the fader exists, but **dungeon entrances are handed to no interaction system** — the code says so at `Dungeons.ts:206-225`, and records that the old wiring called `Interaction.add` (the method is `register`) with every field of the payload wrong, so the guard was always false. `enter()` is reached only by the capture harness and by `integration.mts`. **Nothing reads `Dungeons.prompt`.** No player can enter a dungeon.
- [~] **Dungeon maps** — `kit/DungeonMap.ts` is a complete renderer with seen-room fog and typed markers (chest/locked/boss/exit), exposed as `Dungeons.mapData()` / `drawMap()`, and **no UI calls either**
- [ ] Costlemark Tower · Steyliff Grove · Pitioss · the 8 Menace lairs — POIs only (Steyliff and Pitioss are not even POIs)

### 9.8 Side content
- [ ] Fishing — 10 spots placed with jetty and shack kits; no rod, cast or catch. The `fish` objective is never notified.
- [ ] Photography — `PhotoScreen` is filters, frames and dials; `accept()` sets a flash timer and nothing else. No framebuffer capture, no album, no quest notify. "Shot 128 of 200" is a literal.
- [ ] Justice Monsters Five
- [ ] Chocobo races
- [ ] Bounty hunts beyond the board
- [ ] Collectibles / treasure hunting outside dungeon chests

---

## 10. Story & presentation

- [x] Cutscene system: camera keyframes, staging, letterbox, skip
- [x] The opening — pushing the Regalia down the highway
- [x] Chapter sequencing with gating — 5 chapters
- [x] Area title cards, shown once per place
- [x] Dialogue system with in-character writing
- [x] Story triggers (region entry, time, quest state)
- [x] Title screen / main menu
- [ ] Chapter select
- [ ] Ending — `CHAPTERS` stops at ch.5, "Dark Clouds"; there is no ending scene
- [ ] Character bond conversations at camp — the camp menu is cook / sleep / wait / leave
- [ ] **Chapter 3 is blocked**: `main_ch3_deadeye` requires killing an enemy nothing spawns (§6.4)

---

## 11. UI — 14 screens, all registered and reachable

- [x] Field HUD: party stack with damage-chase bars, weapon wheel, compass
- [x] Combat HUD: reticle, world-anchored nameplates, Armiger gauge, damage numbers
- [x] Call-out banners (BLINDSIDE / PARRY / LINK-STRIKE)
- [x] Subtitles and banter bubbles
- [x] Screen FX: low-HP vignette, damage flash, level-up, area cards
- [x] Procedural SVG icon set
- [x] No CSS transitions — deterministic captures
- [x] Minimap
- [x] Screens: **main · inventory · ascension · armiger · map · world · map_wide (atlas) · gear · quests · archives · system · controls · photo**, plus **shop** and **hunt board** registered lazily by the town. `uxcheck.mts` asserts every main-menu row opens something, and that Tab and Backspace close from every registered name.
- [x] **The Ascension screen draws the real 106-node graph** and unlocks against real AP. *The old parenthetical "currently drawing a fake grid" was stale and contradicted this file's own §8.*
- [x] **Quest log screen** — 339 lines, reads `rpg.quests.byStatus`, tracks and accepts. *Formerly listed as not-started.*
- [x] **Settings / options screen** — `SystemScreen` is 335 lines of slider/toggle/choice/action rows over live engine state, including the quality tier and the bus volumes. *Formerly listed as not-started.*
- [x] **Tutorial prompts** — `ui/Hints.ts` fires four one-shot cards (boot, first interactable, first Regalia proximity, first menu). Separately `ControlsScreen` is a full bindings card on `H`. *Formerly listed as not-started.* (`LANDMINES.md`: the hint card parks itself over the subject's forehead in face framings.)
- [x] `ArmigerScreen`, `ArchiveScreen` (the bestiary), `ControlsScreen` — three shipped, registered, gate-tested screens this file has never listed
- [x] `MapScreen` is a 22-line subclass of `WorldMapScreen` that keeps both slot names alive — **not a stub**

---

## 12. Audio

- [x] Procedural score with chord progressions
- [x] Adaptive orchestral score with recurring motifs (SOMNUS, brass diminution, choral augmentation)
- [x] Instrument toolkit — **13 voice methods**: strings, brass, wood, choir, pad, pluck, arp, timpani, drum, snare, cymbal, bell, gong. *Piano and harp are `PluckKind` variants, not separate methods.*
- [x] Basic SFX synthesis, and a full SFX bank driven by real combat events
- [x] Footsteps varying by terrain material and gait
- [x] Wind and rain ambience beds; environmental audio tied to weather, time and location
- [x] Convolution reverb from synthesised impulses
- [x] **5 buses**, HRTF positional audio, dialogue ducking
- [x] UI and dialogue audio
- [x] The Regalia's radio — 6 stations
- [x] `src/audio/tools/{profile,verify}.mts` — an audio-specific verification pair, **not run by `npm run check`**
- [ ] Voice acting — not feasible without assets

---

## 13. Performance & engineering

### The gate suite
- [x] **`npm run check` runs 11 gates and prints one table**, cheapest first: `build` (`vite build`) · `anycheck` · `orphans` · `integration` · `uxcheck` · `creaturecheck` · `combatloop` · `roadcheck` · `horizoncheck` · `heightcheck` · `driftcheck`. `--perf` adds `perf` and `gameplay` — quiet tree only. *(The two typechecks are the pre-commit hook's, not `check.mts`'s.)*
- [x] **A gate can report VOID** — measured nothing — distinctly from failed. This is the honesty mechanism behind every perf number below.
- [x] `integration.mts` asserts features are **reachable in play**, not merely present
- [x] `orphans.mts` — static reachability from `main.ts`; **283/283 modules**
- [x] `anycheck.mts` — counts `any` and fails if it rises, ratcheted against `ANY_BUDGET.json`
- [x] `seatcheck.mts` proves `drawnHeightAt` is the renderer's own arithmetic (0.000 m residual) — **written but not a `check.mts` gate**, unlike `horizoncheck`

### Instruments
- [x] `ruler.mts` — the shared instrument under both perf tools: contention verdict, ABBA frame-paired differences, a **measured** noise floor, and `RULER_VALID`. It **voids a run rather than printing a number it cannot stand behind**, and the rule that a median moving less than the floor has not moved.
- [x] `imagestats.mts` — nine frame statistics on our captures against the stored FFXV reference corpus
- [x] `compare.mts` — blind randomised A/B pairs against FFXV plates with a sealed answer key
- [x] `imgdiff.mts` — visual regression, PNG only. **The noise floor is per-shot** (`prompto_closeup` measures 0.373), not the 1.5–1.9 constant everyone quotes. `--heat` shows *where*.
- [x] `shoot --ablate / --hide / --raw` — ablation as a first-class dial, with the rule *ablate before re-tinting* written into `BRIEF.md`
- [x] `attrib.mts` (per-subsystem cost, A/B/A baselined) · `bootprof.mts` · `perf.mts` · `gameplay.mts`
- [x] **42 tools** in `src/tools/`, plus 2 in `_probe/` and 11 in `probes/`. Framing and inspection: `framecam.mts`, `dresscam.mts`, `mapview.mts`, `chartshoot.mts`, `ui-shoot.mts`, `crop.mts`, `corpus.mts`, `sheet.mts`, `probe.mts`. Housekeeping: `cleanup.mts`, `shrink.mts`, `agentstats.mts`.

### Boot and caching
- [x] **Three baked artifacts, not one.** `baked/terrain.bin.gz` (the heightfield, `tools/bake.mts`) · `baked/tex.bin.gz` (**every keyed procedural `DataTexture`**, `engine/TexBake.ts`) · `baked/texc.bin.gz` (the canvas-drawn painted faces with hand-built mip chains). Each has a `.json` freshness stamp keyed on a content hash of a fixed source list.
- [x] Build-time bake + Vite plugin — re-bakes at server start *and* on HMR when a listed generator changes
- [x] Capture daemon — holds one vite + one Chromium + one booted page across invocations
- [~] **`texc.bin.gz` needs a browser and a manual step**: only `node src/tools/texbake.mts --canvas` writes it. The vite plugin can only *prune* a stale one. It is **absent from `src/public/baked/` right now**, so any cold-boot figure that assumed it is not currently reproducible. Probe: `node src/tools/texbake.mts --canvas`, then `node src/tools/bootprof.mts`.
- [ ] Cold-boot time — the last recorded figures are **13.66 s → 6.88 s**, and they are ***unverified*** on this tree for the reason above. Probe: `bootprof.mts` on a quiet tree with all three artifacts present.

### Fixed, and now history
- [x] Shader pre-warm · weapon-swap freeze (15.8 s) · shadow cascade cost · DOF at half resolution · water reflection gated on visibility · streaming hitch (870 → 134–161) · menu open (33 → 16 ms). ***All are historical measurements and none is assertable by reading.*** Probe for any of them: `npm run check:perf` on a quiet tree.
- [x] Pre-commit hook — `vite build`, both typechecks, and the doc line budgets
- [x] Draw-call budget renegotiated in `BRIEF.md`, 400 → 800; measured range 351–506
- [x] **Quality tiers ship and are player-facing** — `low/medium/high/ultra` via `?q=` or `SystemScreen`, driving the light budget among other things
- [~] Weather rebuild hitch — ~400 ms remains
- [ ] 60 fps on all posed shots · 60 fps on all 13 gameplay segments · zero frames over 33 ms in a session — **formally unknown.** The last numbers (`vista_dawn` 37.9, `walk` 49.8) predate `ruler.mts` and used a different headline. Treat as unmeasured until re-run on a quiet tree with `RULER_VALID: true`.
- [ ] Quality tiers verified *meaningful* — the tiers exist; nobody has measured that each one buys what it costs

### The `?debug` dev suite — never listed here before
- [x] `src/dev/` (10 modules) loads only under `?debug`, registered last so it sees the final camera and keeps running while `game.paused` freezes the world. It mounts its own `#dev` root and never touches `src/ui/**`.
- [x] `Console` · `Freecam` · `StatsHud` · `Registry` · `Stage` · `ViewModes` (render debug views) · `AssetBrowser` · `Report` · `Inbox` (the review-note inbox behind the `drain-inbox` workflow, served by `tools/vite-plugin-review.mts`)

---

## 14. TypeScript port — done (2026-08-22)

Full detail in **[`project/handoff/typescript.md`](../project/handoff/typescript.md)**
and the plan it ran from, `project/archive/plans/2026-08-22-opus-phase2-typescript-port.md`.
Every file under `src/` is TypeScript, both typechecks are clean under `strict`,
**all 11 gates green**, and the pixel diff against the pre-port build is inside
each shot's own run-to-run noise. Follow-on **zero `any`: reached**, ratcheted by
`src/tools/anycheck.mts` against `ANY_BUDGET.json`.

- `tsconfig.json` — ES2022 · `module: ESNext` · `moduleResolution: bundler` ·
  `strict` · `noImplicitOverride` · `noUnusedLocals` · `isolatedModules` ·
  `verbatimModuleSyntax` · `allowImportingTsExtensions` · `noEmit`
- `tsconfig.tools.json` — separate, `nodenext`, `types: ["node"]`,
  **`erasableSyntaxOnly: true`**. The tools run under Node's strip-only type
  stripping, which never type-checks and rejects some legal TypeScript
  (parameter properties, enums, namespaces); that flag is what keeps them
  runnable, and `tsc` is the only thing that checks them at all. Probe snippets
  under `src/tools/_probe/` and `src/tools/probes/` are excluded: they are read
  as text and evaluated as a *function body*.

**Why it was worth doing here specifically.** Two of the worst bugs this project
hit were type errors a compiler catches for free: `Game.get()` keyed on
`constructor.name` (mangled in production, `undefined` everywhere), and
`spec.at ?? 6` resolving to `String.prototype.at` — a function where a number was
expected — which NaN'd the entire title-screen camera. Typing the receiver is
also what emptied `LANDMINES.md`'s "names nothing ever verified" table: every
dead fallback arm in it fell out by itself once `game` had a real type.
