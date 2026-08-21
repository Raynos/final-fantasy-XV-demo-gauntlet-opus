# FINAL FANTASY XV — Eos. Atomic scope checklist

Every discrete thing the game should contain, one line each, checkable.
`[x]` shipped and verified · `[~]` in progress right now · `[ ]` not started.

Taking over? Start with **[`project/HANDOFF.md`](project/HANDOFF.md)**.

Companion docs: `project/PROGRESS.md` (status by area, scoreboard, bug log) ·
`docs/plans/2026-08-17-opus-content-gameplay.md` (design audit and sequencing) · `docs/WORLDMAP.md` (cartographic design, pending) ·
`BRIEF.md` (engineering + art contract).

**Counts at last update (2026-08-17 ~08:00, verified against `main` @ 98 commits):**
335 atoms · **249 shipped** · **2 in progress** · **84 not started**.

Every `[x]` below was checked against the code on `main`, not against an agent's
report. Where a claim was only partly true it has been reworded rather than ticked.

Recount with:
```sh
grep -c '^- \[x\]' docs/SCOPE.md   # shipped
grep -c '^- \[~\]' docs/SCOPE.md   # in progress
grep -c '^- \[ \]' docs/SCOPE.md   # not started
```

---

## 1. World map & zones

### 1.1 Cartography
- [x] Authored world map design (`docs/WORLDMAP.md`) — not noise-grown terrain
- [x] `WorldMap.js` as single source of truth: zones, POIs, road graph, biome params
- [x] Zone query API — `zoneAt`, `nearestPOI`, `poiById`, `discover`, `roadGraph`
- [x] Terrain generated *from* the map design rather than decorated after the fact
- [x] World substantially larger than the current 3 km basin — **8192 x 8192 m**
- [ ] Streaming/paging so a large world stays in budget
- [ ] Zone transitions with area title cards

### 1.2 Named zones
- [x] Leide — badlands, red ochre, level 1–12
- [x] Longwythe sub-region
- [x] Prairie Outpost sub-region
- [x] Duscae — humid green, lakes, level 12–30
- [x] The Nebulawood
- [x] Alstor Slough
- [x] Wiz Chocobo Post country
- [x] Cleigne — level 30–50
- [x] Vesperpool
- [x] Malmalam Thicket
- [x] Ravatogh (volcano)
- [x] Cauthess / the Disc of Cauthess
- [ ] Altissia — cut, out of scope
- [ ] Niflheim / Gralea — cut, out of scope

### 1.3 Points of interest (target 50+)

`[x]` here means **placed in `WorldMap.js` with coordinates, type and gating**, and
discoverable on the map. Only Hammerhead is additionally *built* as a visitable
place with geometry, NPCs and interiors — the rest are markers on real ground.
- [x] **124 POIs** with name, type, coordinates, discovery radius, purpose, gating
- [x] Haven (1) — rune platform, campfire, tent
- [x] Havens — 17 placed
- [x] Abandoned outpost
- [x] Wrecked truck
- [x] Ruined obelisks (3)
- [x] Crashed magitek dropship
- [x] Comms relay mast
- [x] Water tower
- [x] Solheim viaduct
- [x] Meteor of the Disc (horizon landmark)
- [x] Niflheim dreadnought (horizon landmark)
- [x] Imperial capital skyline (horizon landmark)
- [x] Hammerhead — **built**: garage, diner, pumps, caravan, pylon, 11 NPCs
- [x] Longwythe Rest Area
- [x] Galdin Quay
- [x] Lestallum
- [x] Old Lestallum
- [x] Cape Caem
- [x] Meldacio Hunter HQ
- [x] Coernix Station(s)
- [x] Chocobo posts
- [x] Fishing spots
- [x] Royal tombs
- [x] Imperial bases
- [x] Parking spots / laybys

### 1.4 Road network
- [x] One carved highway spline with camber, ruts, berms
- [x] Road furniture: delineators, barriers, signage, culverts, skid marks
- [x] Telegraph poles with catenary cable
- [x] Real road *graph* — spine, branches, dirt tracks, junctions
- [x] Car-friendly grades and corner radii
- [x] Every drivable POI reachable by road
- [ ] Bridges over canyons/water
- [ ] Tunnels
- [x] Drivability assertion test — `src/tools/roadcheck.mjs`, 39/39 reachable, 0 failures

### 1.5 Minimap & world map
- [x] Minimap — baked relief chart shared with the atlas, roads, glyphs, compass; 0.5-0.7 ms/frame
- [x] World map screen — hillshaded relief, road hierarchy, zone borders, 10 filters, POI card
- [x] Distance + estimated travel time display
- [~] Fast travel — offered on the map card; destination jump not wired
- [ ] Map discovery/fog persistence in saves

---

## 2. Terrain & environment

- [x] 2048² heightfield, hydraulic erosion (420k droplets), flow map
- [x] 7-level geometry clipmap, crack-free, pop-free
- [x] 6 procedural PBR layers, height-blended splatting
- [x] Triplanar rock with sedimentary banding
- [x] Fine strata (3.5–14 m beds) — reads as *distant*, not merely large
- [x] Silhouette variety: benched mesas, fins, hogbacks, talus aprons, saddles
- [x] Near-field detail (2–4 m triplanar), gravel, cracking, scour
- [x] De-tiled rock faces (per-massif scale + domain warp)
- [x] Road carving with wheel ruts in the control texture
- [x] `heightAt`/`normalAt`/`slopeAt`/`sampleMaterial`/`roadDistance`/`roadCenterX`
- [x] Water: planar reflection, waves, fresnel, sun glint, shoreline depth tint
- [ ] Rivers and waterfalls — named in map data only
- [ ] Caves as terrain features (distinct from dungeon interiors)
- [ ] Snow / volcanic biome surfaces

---

## 3. Sky, weather & lighting

- [x] Rayleigh/Mie/ozone scattering, GPU-baked transmittance + sky-view LUTs
- [x] Sun colour derived from atmospheric transmittance
- [x] Volumetric clouds — Nubis shape/erode, dual-lobe phase, silver lining
- [x] Cloud shadows on terrain
- [x] Cirrus layer
- [x] God rays / light shafts
- [x] Aerial perspective (Rayleigh + sun-confined Mie lobe)
- [x] Height fog / valley fog pooling
- [x] Day/night cycle with `setTimeOfDay`
- [x] Starfield, milky way, moon with phase and its own key light
- [x] 3-cascade shadow maps
- [x] PMREM environment probe from the sky
- [x] Weather presets: clear / overcast / storm / fog, continuous transitions
- [x] Rain — GPU streaks, parallax shells, splash rings, 2 draw calls
- [x] Wet surfaces — albedo darkening, roughness drop, puddles in flow channels
- [x] Lightning with thunder delay and real scene relight
- [x] Blowing dust, squall curtains, scud
- [x] Wind vector with gusts driving vegetation
- [ ] Night/dusk key light fix — `haven_dusk` is under-exposed mud
- [x] Cloud raymarch upsample blockiness — sub-texel Halton jitter, TAA resolves it
- [ ] Rainbows, auroras, meteor showers

---

## 4. Vegetation & props

- [x] Instanced grass, 3 LOD rings, tile-streamed
- [x] Leide-correct blade scale (0.15–0.35 m) in tufts, dry olive/straw
- [x] Wind: travelling gust front + per-instance flutter
- [x] Trample/clearance for up to 10 actors
- [x] Bushes and scrub
- [x] Trees — 4 species, recursive branching, impostors baked from real geometry
- [x] Backlit leaf translucency
- [x] Rocks — fracture-plane geology, 8 kinds, split normals, triplanar UVs
- [x] Debris scatter: branches, bones, litter
- [x] Wildlife — raptors on thermals, garula herds, dusk midges
- [ ] More fauna: sabertusk packs roaming, birds landing, fish
- [ ] Destructible/interactive props
- [ ] Harvestable ingredient nodes

---

## 5. Characters

- [x] 40-bone humanoid rig with spring bones
- [x] Shared anatomy sweeps — skin and cloth from one source
- [x] Correct proportions (7.77 heads, 2.84 shoulder widths, legs 49.3%)
- [x] Procedural faces with eye geometry, sockets, brows, lash lines
- [x] Contrast-preserving mips so features survive at distance
- [x] Subsurface-ish skin with thickness channel
- [x] Kajiya-Kay hair with strand tangents
- [x] Layered garments: jacket, collar, hem, belts, straps, boots
- [x] Noctis, Gladiolus, Ignis, Prompto — identity-distinct
- [x] Parametric gait blending idle→walk→jog→sprint
- [x] Two-bone foot IK with ankle-to-slope alignment
- [x] Companion formation AI with separation and glances
- [x] Contact shadows / grounding
- [ ] Head sculpt pass — nose/chin, shadow-side torsos
- [ ] Hair as true layered locks rather than opaque ribbons
- [ ] Facial animation: blinks in dialogue, expressions, lip sync
- [ ] Character portraits in the UI (still generic silhouettes)
- [ ] Climbing / vaulting / ledge traversal animations
- [ ] Swimming
- [ ] Outfit changes / gear visually reflected

---

## 6. Combat

### 6.1 Core
- [x] Hold-to-attack auto-combo chains per weapon
- [x] Dodge roll with i-frames
- [x] Hold-to-phase (MP-draining parry) with slow-mo counter window
- [x] Blindside attacks
- [x] Link-strikes
- [x] Warp-strike
- [x] Warp-to-point repositioning
- [x] Stasis (MP-zero recovery state)
- [x] Armiger burst with orbiting phantom weapons
- [x] Hitstop on impact
- [x] Lock-on targeting
- [ ] Wait Mode
- [ ] Royal Arms with HP-cost drawback
- [ ] Weapon durability/upgrade paths

### 6.2 Damage & progression model
- [x] Physical/magical damage formula with defence mitigation
- [x] Elemental resist / immune / absorb
- [x] Weapon-class weakness bonuses
- [x] Stagger multipliers, back and warp bonuses, crits
- [x] Night daemon scaling
- [x] Damage numbers driven by the real formula (not literals)

### 6.3 Encounters
- [x] Roaming groups with territories and patrols
- [x] Sight cones, hearing, aggro/de-aggro
- [x] Group coordination (flanking, not queueing)
- [x] Combat start/end state for HUD and music
- [x] Victory: EXP, AP, gil, item drops
- [x] Party companions actually attacking
- [x] Techniques: Tempest, Royal Guard, Enhancement, Regroup, Overwhelm, Starshell, Piercer, Trigger-Happy
- [x] Tech bar charging
- [x] Player downed state with bleed-out and ally revive
- [x] Game over and retry
- [x] Ambushes and enemy reinforcements
- [ ] Summons / Astral invocation conditions

### 6.4 Bestiary
- [x] Sabertusk
- [x] Goblin
- [x] Imperial MT Trooper
- [x] Iron Giant
- [x] Dualhorn, Voretooth, Garula, Anak, Coeurl, Bandersnatch, Mesmenir, Arachne
- [x] Imperial Axeman / Sniper / Magitek Armour
- [x] Daemons: Bussemand, Hobgoblin, Necromancer, Ronin, Red Giant
- [ ] Behemoth (Deadeye)
- [ ] Zu
- [ ] Malboro
- [ ] Cactuar / Tonberry

### 6.5 Bosses
- [x] Field boss (Behemoth-class)
- [x] Imperial set piece with dropship arrival
- [x] Astral-scale fight (Titan)
- [ ] Ramuh
- [ ] Leviathan
- [ ] Shiva
- [ ] Ifrit

### 6.6 Magic
- [x] Elemancy crafting — energy + catalyst → computed spell
- [x] Tiers (Fira/Firaga), Quadcast/Healcast/Expericast side-effects
- [x] Fire / ice / lightning VFX with real light emission
- [x] Elemental reactions (steam, conduction, firestorm)
- [ ] Elemental deposits placed in the world to draw from
- [ ] Ring of the Lucii

---

## 7. VFX

- [x] GPU particle system, analytic motion in vertex shader
- [x] Soft particles with depth fade
- [x] Weapon trail ribbons
- [x] Warp shard burst, dash streak, impact shockwave
- [x] Crystal materialisation dissolve
- [x] Ground FX: scorch, cracks, frost, rings conforming to terrain
- [x] 8-light pool, permanently resident
- [ ] Screen-space distortion / heat haze
- [ ] Blood/impact decals persisting on surfaces

---

## 8. RPG systems

- [x] Stats: 6 core, level curve to 99, 24.2M EXP table
- [x] EXP banking, converted on rest × lodging multiplier
- [x] Ascension grid: 106 nodes, 9 constellations, 5,655 AP
- [x] AP earning rules (warp-strikes, parries, link-strikes, quests, driving)
- [x] Inventory: 137 items, 37 weapons, 18 accessories, per-character slots
- [x] Elemancy crafting model
- [x] Quests: 30 authored (7 chapters, 12 hunts, 11 side)
- [x] Party: 13 techniques, 6 bond levels
- [x] Cooking: 30 recipes with timed buffs, Ignis's cooking level
- [x] DayCycle: 8 phases, daemon pressure, havens, camping
- [x] SaveGame with versioning and migration
- [x] **Wired to the UI and combat** (was entirely dead code)
- [x] Ascension screen rendering the real 106-node graph
- [x] Inventory/gear screens reading real tables
- [ ] Quest coordinates matching real world geometry
- [ ] Shops trading against the real gil economy
- [ ] Hunter rank progression
- [ ] Tomes / bestiary completion rewards

---

## 9. Gameplay loop & content

### 9.1 Interaction
- [x] Interaction verb — proximity + facing, contextual prompt, hysteresis
- [x] Talk / Shop / Hunts / Rest / Drive interactables
- [ ] Examine / pick up world items
- [ ] Doors and gates

### 9.2 Towns & NPCs
- [x] Hammerhead: garage, Crow's Nest diner, fuel canopy, caravan, pylon sign, parts yard
- [x] Night floodlights
- [x] Cindy, Cid, Takka, Dave
- [x] Ambient civilians with walking routes and behaviours
- [x] Multi-exchange dialogue with branching
- [ ] Other settlements

### 9.3 Shops & economy
- [x] Takka's diner (food/ingredients tied to cooking)
- [x] Garage general store (curatives, catalysts)
- [x] Weapon & accessory counter
- [x] Buy and sell with real prices
- [ ] Regional price variation / stock gating

### 9.4 Quests
- [x] Main chapter sequencing with objective handoff
- [x] Hunt board with 12 hunts, ranks, tipsters, rewards
- [x] Accepting a hunt spawns its target
- [ ] Side quests with real objectives in the world
- [ ] Fetch / escort / photo objective types wired
- [ ] Quest log screen

### 9.5 Camp & rest
- [ ] Camping at havens — the caravan Rest at Hammerhead works; havens are not wired
- [ ] Ignis cooking scene with meal selection
- [ ] EXP banking on rest
- [ ] Prompto's photos reviewed at camp
- [ ] Caravan / lodging rest with multipliers

### 9.6 Traversal
- [x] Manual driving of the Regalia — suspension, weight transfer, grip
- [x] Auto-drive with Ignis to a waypoint
- [x] Drive camera (chase, cinematic, bonnet)
- [x] Enter/exit with all four seated
- [x] In-car party banter, context-triggered
- [x] The radio with multiple procedural tracks
- [x] Fuel consumption and refuelling
- [x] Night driving danger
- [ ] Regalia Type-F flight
- [ ] Car customisation / decals
- [ ] Chocobo riding
- [ ] Chocobo rental and posts
- [ ] Chocobo racing
- [~] Fast travel — offered on the map card; destination jump not wired

### 9.7 Dungeons
- [x] Dungeon system: room graph, critical path, side branches, boss chamber
- [x] Interior lighting (sun must not leak in)
- [x] World entrances with transitions
- [x] Keycatrich Trench
- [x] Balouve Mines
- [x] Fociaugh Hollow
- [x] Treasure, hazards, locked doors
- [ ] Costlemark Tower
- [ ] Steyliff Grove
- [ ] Pitioss
- [ ] Menace dungeons
- [ ] Dungeon maps in the UI

### 9.8 Side content
- [ ] Fishing — spots are placed on the map; no minigame
- [ ] Photography with Prompto (screen exists, unwired)
- [ ] Justice Monsters Five
- [ ] Chocobo races
- [ ] Bounty hunts beyond the board
- [ ] Collectibles / treasure hunting

---

## 10. Story & presentation

- [x] Cutscene system: camera keyframes, staging, letterbox, skip
- [x] The opening — pushing the Regalia down the highway
- [x] Chapter sequencing with gating
- [x] Area title cards
- [x] Dialogue system with in-character writing
- [x] Story triggers (region entry, time, quest state)
- [x] Title screen / main menu
- [ ] Chapter select
- [ ] Ending
- [ ] Character bond conversations at camp

---

## 11. UI

- [x] Field HUD: party stack with damage-chase bars, weapon wheel, compass
- [x] Combat HUD: reticle, world-anchored nameplates, Armiger gauge, damage numbers
- [x] Call-out banners (BLINDSIDE / PARRY / LINK-STRIKE)
- [x] Main menu, inventory, gear, map, photo screens
- [x] Ascension constellation screen (currently drawing a *fake* grid)
- [x] Subtitles and banter bubbles
- [x] Screen FX: low-HP vignette, damage flash, level-up, area cards
- [x] Procedural SVG icon set
- [x] No CSS transitions — deterministic captures
- [x] Shop screen
- [x] Hunt board screen
- [x] Minimap
- [x] World map screen
- [ ] Quest log screen
- [ ] Settings / options screen
- [ ] Tutorial prompts

---

## 12. Audio

- [x] Procedural score with chord progressions
- [x] Basic SFX synthesis (swing, hit, warp, magic, UI)
- [x] Wind and rain ambience beds
- [x] Convolution reverb from synthesised impulses
- [x] Adaptive orchestral score with recurring motifs
- [x] Instrument toolkit (strings, brass, woodwind, piano, harp, choir, percussion)
- [x] Full SFX bank driven by real combat events
- [x] Footsteps varying by terrain material and gait
- [x] Environmental audio tied to weather, time and location
- [x] Bus mixing, positional audio, dialogue ducking
- [x] UI and dialogue audio
- [x] The Regalia's radio
- [ ] Voice acting — not feasible without assets

---

## 13. Performance & engineering

- [x] Screenshot harness with error gating
- [x] Posed FPS benchmark (`src/tools/perf.mjs`)
- [x] Gameplay FPS benchmark with scripted input (`src/tools/gameplay.mjs`)
- [x] Subsystem cost attribution (`src/tools/attrib.mjs`)
- [x] Production build verified (`--prod`)
- [x] Contact sheets for critic review
- [x] Build-time bake + Vite plugin — terrain init 8,320 ms → 285 ms
- [x] Capture daemon — warm single-shot capture 23.6 s → 1.5 s
- [x] Image-diff regression tool (`src/tools/imgdiff.mjs`), noise floor 1.58–1.99/255
- [x] Pre-commit build check (`.githooks/pre-commit`)
- [x] Orphan process cleanup (`src/tools/cleanup.mjs`)
- [x] Boot profiler (`src/tools/bootprof.mjs`), road drivability check (`src/tools/roadcheck.mjs`)
- [x] Shader pre-warm (programs climb 174 → 369 in-session)
- [x] Weapon swap freeze (15.8 s) eliminated
- [x] Shadow cascade cost (83% of frame)
- [x] DOF at half resolution
- [x] Water reflection gated on visibility
- [x] Streaming hitch — grass instance re-upload fixed; hitches 870 → 134–161
- [~] Weather rebuild hitch — ~400 ms remains
- [x] Menu open — 33 ms → 16 ms once the reflection stopped rendering the whole scene
- [ ] 60 fps on all 15 posed shots
- [ ] 60 fps on all 13 gameplay segments
- [ ] Zero frames over 33 ms in a session
- [x] Draw-call budget renegotiated in `BRIEF.md` — 400 → 800
- [x] Automated visual regression diffing (`src/tools/imgdiff.mjs`)
- [ ] Quality tiers (low/medium/high/ultra) verified meaningful

---

## 14. TypeScript port (planned — blocked on the current agent wave)

Full detail in **[`docs/plans/2026-08-17-opus-typescript-port.md`](docs/plans/2026-08-17-opus-typescript-port.md)**.

Match the sibling attempts `../final-fantasy-XV-demo-opus` (172 `.ts`) and
`../final-fantasy-XV-demo-ogl-opus` (100 `.ts`), which are 100% TypeScript with
zero `.js` in `src/`.

**Target config**, copied from the siblings so the three projects agree:

- `tsconfig.json` — ES2022 · `module: ESNext` · `moduleResolution: bundler` ·
  `strict: true` · `noImplicitOverride` · `noUnusedLocals` · `isolatedModules` ·
  `verbatimModuleSyntax` · `allowImportingTsExtensions` · `noEmit` (Vite
  transpiles) · `types: ["vite/client"]` · `include: ["src/**/*.ts"]`
- `tsconfig.tools.json` — separate, `module/moduleResolution: nodenext`,
  `types: ["node"]`, **`erasableSyntaxOnly: true`**. Our tools run under Node's
  strip-only type stripping, which never type-checks and rejects some legal
  TypeScript (parameter properties, enums, namespaces) — that flag is what keeps
  them runnable, and `tsc` is the only thing that checks them at all.
- devDeps: `typescript`, `@types/node`, `@types/three`
- scripts: `typecheck` and `typecheck:tools`, both `tsc --noEmit`

**Sequencing — do not start while agents are live.** 235 modules and ~79,500
lines are under concurrent edit by six agents; porting under that would conflict
with everything. Order:

- [ ] Land every in-flight agent branch and merge to `main`
- [ ] Add tsconfigs, devDeps and the two `typecheck` scripts (no renames yet)
- [ ] Port `src/util/**` first — leaf modules, no internal imports, they define
      the shared types (`Noise`, `Rng`, `TextureGen`)
- [ ] Port `src/engine/**` and define the core interfaces: the `System` contract
      (`init`/`update`/`lateUpdate`), `Game`'s registry, and a typed `SHOTS` shape
- [ ] Port `src/game/rpg/**` — pure logic, no three.js, highest type value
- [ ] Port `src/world/**`, `src/characters/**`, `src/combat/**`, `src/ui/**`
- [ ] Port `src/tools/**` to `.mts` under `erasableSyntaxOnly`
- [ ] `typecheck` and `typecheck:tools` clean, `vite build` passes, and the
      integration audit still reports 0 failures
- [ ] Add both typechecks to the pre-commit hook alongside the build

**Why it is worth doing here specifically.** Two of the worst bugs this project
hit were type errors a compiler catches for free: `Game.get()` keyed on
`constructor.name` (mangled in production, returned `undefined` everywhere), and
`spec.at ?? 6` resolving to `String.prototype.at` — a function where a number was
expected — which NaN'd the entire title-screen camera.
