# LUCIS — the world map

A cartographic design for the open world of *FINAL FANTASY XV — Eos*, and the
contract the terrain, the vegetation, the props, the quests, the town, the
driving system and the UI all read from.

The design lives as data in **`src/world/map/WorldMap.js`** (zones, points of
interest, required landforms) and **`src/world/map/RoadGraph.js`** (junctions,
routes, road classes). Nothing in this document is prose-only: every coordinate
below is in one of those two files, and `src/world/terrain/Field.js` *realises*
them rather than inventing its own.

---

## 0. The sheet

| | |
|---|---|
| Playable field | **8192 × 8192 m** — x, z ∈ [−4096, +4096] |
| Detail grid | 2048² heightfield at **4 m** cells, plus an analytic 4–16 m micro-relief term evaluated identically on CPU and GPU |
| Frontier | 1024² at 32 m out to ±16 km — the ranges you can see but never reach |
| North | **−Z**. East is +X. |
| Sea level | **−6.5 m** (matches `Water.level`; anything carved below it floods) |
| Origin | **Hammerhead**, the western gate of Leide, and the player's start |
| Corner to corner | 11.6 km diagonal · **5 min 43 s** driving the Regalia from the Insomnia checkpoint to the Ravatoghan trailhead |
| Road network | **30.3 km** over 19 routes, 50 junctions, 50 edges |
| Named places | **124** points of interest across 19 zones and 3 regions |

The world is laid out the way Lucis actually is: Insomnia in the far east
behind its Wall, **Leide**'s ochre badlands as the eastern third, **Duscae**'s
green basin in the centre, **Cleigne**'s highlands and volcano to the west and
north-west, with the Cygillan Ocean along the southern shore. Travelling the
game is travelling west, and the level curve goes with it: 1 at Hammerhead, 60
on the rim of Ravatogh.

### Why 8.2 km and not more

Because the heightfield is one resident grid, not a streamed one, and the
budget is honest about that. At 2048² the choice is *span versus cell size*.
8192 m at 4 m cells costs exactly what the previous 3072 m at 1.5 m cells cost
— same memory, same build time — and buys 7× the area. What it loses is the
1.5–4 m detail band, which is put back analytically by `microDetail()` in
`Field.js` and its exact GLSL twin `tf_micro()` in `TerrainMaterial.js`, so
`heightAt()` still returns the surface the GPU displaces to, to the millimetre.
A larger world than this needs real streaming, which is a different workstream.

---

## 1. Regions

| region | character | levels | tint |
|---|---|---|---|
| **Leide** — the Ochre Marches | Sun-cracked badlands. Mesas, dry washes, rust-red rock, telegraph poles, and the long road home to a city that is no longer there. Sandstorms happen here and nowhere else. | 1 – 15 | ochre |
| **Duscae** — the Green Basin | Humid lowland forest, standing water, meteor craters. The sky never quite clears. The Disc of Cauthess burns on the northern horizon. | 15 – 35 | green |
| **Cleigne** — the Highland Reach | Cold uplands, a basalt shelf with a city bolted to it, a drowned forest, and an active volcano. The one place on the continent still lit at night. | 35 – 60 | blue-grey |

---

## 2. Zones

A zone is not a polygon. Each is a rotated elliptical influence field; every
point in the world carries a normalised weight per zone, the terrain blends
**biome parameters** by those weights, and `worldMap.zoneAt(x, z)` returns the
strongest for the UI. Borders are therefore geology, not lines — the Nebulawood
does not stop at a fence, it thins into the Malacchi Hills.

Biome parameters, all consumed by `Field.macroHeight()`:
`base` (baseline elevation) · `relief` (rolling fbm amplitude) · `ridge`
(mountain belt amplitude) · `ridgeIn` (how wide the travel corridor stays open)
· `terrace` (how hard the land benches into mesa steps) · `rough` · `warp`
(domain warp) · `moist` (drives material splat, vegetation and map tint) ·
`rocky` · `style` (0 = broad table/cuesta, 1 = spiky fang).

### Leide

| zone | centre (x, z) | extent | lv | character | terrain must do |
|---|---|---|---|---|---|
| **Longwythe** | 380, −260 | 1250 × 1050 | 1–8 | Open scrub pan under a black horn. The tutorial country; Hammerhead sits in it. | A genuinely level pan for the garage apron; a benched hero table (Blackrock) NW; a butte cluster E; a 430 m peak N |
| **The Three Valleys** | 1360, 1160 | 1150 × 1000 | 4–12 | Three parallel dry valleys between hogback fins. Sabertusk country; the first real ambush ground. | Three fins on parallel NE axes with flat wash floors between them |
| **Ostium Gorge** | 3180, 120 | 1150 × 1400 | 10–20 | The shattered approach to Insomnia. Broken flyovers, imperial armour, a car graveyard in a defile. | A 320 m scarp wall behind the Wall; heavy terracing; the highway threads a defile |
| **Vannath Coast** | 2060, 1280 | 900 × 1100 | 6–14 | The dry prairie the Galdin road crosses. Grazing dualhorn, wind, nothing else. | Broad, level, fast; low ridge amplitude so the road runs at speed |
| **Galdin Coast** | 2540, 2760 | 1420 × 1200 | 8–16 | The southern shore. Turquoise shallows, a pier hotel, Angelgard offshore. | Land falls to a sea floor at −46 m; one sheer island out of the water |
| **Keycatrich** | 200, −1600 | 900 × 900 | 8–16 | A bombed-out spa town swallowed by dust, and the trench beneath it. | A 156 m rim the ruined town shelters under; a track that climbs to it |
| **The Callaegh Steps** | 2760, 1100 | 900 × 900 | 12–22 | Spoil heaps and shaft heads above the deepest mine in Lucis. | A 136 m spoil bench; a graded ore road onto it |

### Duscae

| zone | centre (x, z) | extent | lv | character | terrain must do |
|---|---|---|---|---|---|
| **Alstor Slough** | −1180, 620 | 1000 × 900 | 15–24 | Standing water under a green haze. Boardwalks, reed beds, wading catoblepas. | A basin floored at **−16 m**, i.e. below the water plane, held back 100 m from the road so Route 3 crosses on a causeway |
| **The Malacchi Hills** | −1900, 220 | 900 × 850 | 16–26 | Open chocobo prairie broken by lone broadleaf stands. Wiz country. | Broad level ground a chocobo can gallop; ridge amplitude kept low |
| **The Nebulawood** | −1560, −1180 | 950 × 900 | 22–32 | Close, dark, wet forest. The canopy closes and the light goes green. | A flat forest floor at ~30 m — canopy cannot close over a slope |
| **Mencemoor** (the Disc) | −1020, −2160 | 1250 × 1150 | 28–40 | A meteor the size of a mountain range, still glowing where it struck. | **A crater**: 210 m raised rim, 120 m sunken crust, a 300 m core mass, shock-fractured plates. The road runs onto a spur of the rim, not into the hole |
| **Taelpar Crag** | −2320, −700 | 1000 × 950 | 24–34 | A gorge you cannot see the bottom of, and one crossing. | **A 235 m canyon** running N–S across the highway. The cut is held back 78 m from the road, which leaves a natural neck — the bridge abutment |
| **The Fallgrove** | −800, 1560 | 950 × 900 | 20–30 | Grazed downland south of the slough, ringed by dead grovewood. Costlemark Tower stands in it. | Rolling downs at ~28 m; a lane that dies at the tower |

### Cleigne

| zone | centre (x, z) | extent | lv | character | terrain must do |
|---|---|---|---|---|---|
| **The Lestallum Shelf** | −3060, −680 | 950 × 900 | 30–42 | A level basalt terrace 120 m above the plain with a city bolted to it. | **A terrace**: flat top at 122 m, cliffs on the exposed side, and a graded ramp where Route 1 climbs it |
| **Pallareth Pass** | −1780, −3060 | 1050 × 900 | 40–52 | The pass between the Cauthess range and the Vesperpool basin. Hunters run it. | A shallow canyon floor with a 320 m wall north and a 250 m wall south — the road runs the floor |
| **The Vesperpool** | −3020, −2360 | 1100 × 1000 | 38–50 | A drowned forest. Dead trunks stand in black water; the fishing is famous. | A basin at **−20 m**; a dry causeway bench at 44 m for the road head |
| **The Rock of Ravatogh** | −3400, −2960 | 880 × 880 | 48–60 | An active volcano. Ash slopes, lava tubes, the highest point in Lucis. | **A 720 m cone** with a crater bowl and a rim lip; ash road stops at its foot |
| **Malmalam Thicket** | −3180, 1560 | 930 × 930 | 42–54 | A thicket so dense the road stops and the map goes blank. | A shallow bowl at 42 m so the canopy closes over it; a turning circle against a wall of trees |
| **Cape Caem** | −2500, 2200 | 900 × 900 | 30–40 | A green headland with a lighthouse, a vegetable patch and a hidden harbour. | A 100 m flat-topped headland with cliffs into a −44 m sea |

Everything outside every zone's reach is **the Frontier** — generic Lucian
highland, the buffer that carries the eye out to the far ranges.

---

## 3. Points of interest — 124

| type | n | what the player does |
|---|---|---|
| town | 3 | Hammerhead · Lestallum · Galdin Quay — shops, garage, hotel, hunt boards, NPCs |
| outpost | 8 | fuel, item shop, outfitter, hunts, chocobo hire |
| rest stop | 3 | caravan (rest / save / cook), diner, pump |
| parking spot | 23 | park the Regalia, turn it round, start a hike |
| haven | 17 | camp, cook, level up, save |
| dungeon | 11 | 8 sealed-vault dungeons + Myrlwood, Malmalam and Pitioss |
| menace lair | 8 | the post-game Menace Beneath Lucis, one under each sealed dungeon |
| royal tomb | 10 | a Royal Arm each |
| imperial base | 6 | magitek garrisons, forts and depots to break |
| chocobo post | 2 | rental, salon, race circuit |
| fishing spot | 10 | rod, lure, a named catch list |
| landmark | 23 | the sights — peaks, the meteor, the gorge, the Wall, the lighthouse |

Every entry carries `name`, `type`, `zone`, world `x, z`, a **discovery radius**
(walk inside it and it is revealed), what the player *does* there, its level,
whether it is a fast-travel destination, and its `gate` (`null` = open from the
start; otherwise a chapter, a level or a prerequisite dungeon).

### The spine, west from the Crown City

`Crown City Checkpoint` (3856, 546) → **Ostium Gorge** → `Formouth Garrison`
(3240, −170, imperial, ch3) → `Longwythe Rest Area` (1120, 62) → **Hammerhead**
(60, 18) → `Coernix Station – Alstor` (−1080, −120) → `Norduscaen Blockade`
(−1560, −228, imperial, ch4) → `Taelpar Rest Area` (−2130, −420) →
**Taelpar Bridge** (−2286, −486) → **Lestallum** (−2960, −700).

### The branches

- **South-east:** Galdin Junction → **Galdin Quay** (2330, 2380) — Mother of
  Pearl, the Altissia ferry berth, Galdin Shoals, Angelgard offshore.
- **North of Hammerhead:** the Keycatrich track → `Keycatrich Ruins` → the
  **Keycatrich Trench** (lv 12, the first dungeon) with the Tombs of the Wise
  and the Conqueror.
- **Duscae ring (Route 3):** Prairie Outpost → the Fallgrove → **Wiz Chocobo
  Post** (−2050, 460) → `Aracheole Stronghold` → back onto the highway at
  Taelpar.
- **Cleigne north (Route 5):** `Old Lestallum` → `Cotisse Haven` → the
  **Vesperpool causeway** → `Fort Vaullerey` → **Meldacio Hunter HQ**
  (−1950, −2960) — Ezma, the all-region hunt board and the Sealbreaker's Key.
- **The ash road (Route 6):** `Verinas Mart – Ravatogh` → the Ravatoghan Trail
  → **The Rock of Ravatogh**, and beyond it Pitioss.

### The eight sealed dungeons and their Menaces

| dungeon | region | lv | Menace lv | tomb inside |
|---|---|---|---|---|
| Keycatrich Trench | Leide | 12 | 55 | Sword of the Wise · Axe of the Conqueror |
| Balouve Mines | Leide | 50 | 78 | Bow of the Clever |
| Crestholm Channels | Leide | 60 | 92 | — |
| Fociaugh Hollow | Duscae | 28 | 65 | — |
| Costlemark Tower | Duscae | 55 | 99 | Greatsword of the Tall |
| Daurell Caverns | Leide/Duscae line | 40 | 72 | — |
| Greyshire Glacial Grotto | Cleigne | 30 | 65 | Swords of the Wanderer |
| Steyliff Grove | Cleigne | 45 | 86 | — |

Plus **Myrlwood** (Star of the Rogue), **Malmalam Thicket** (Scepter of the
Pious), **The Rock of Ravatogh** (Mace of the Fierce), **the Disc of Cauthess**
(Blade of the Mystic), **Thommels Glade** (Shield of the Just) and **Pitioss
Ruins** (gated behind the airship; no combat, pure platforming).

---

## 4. The road network

Nineteen named routes, four classes, one graph. Two routes that name the same
junction meet there, so junction geometry falls out of the data instead of being
hand-placed.

| class | surface half-width | shoulder | max grade | min radius | cruise |
|---|---|---|---|---|---|
| **highway** | 5.2 m | 10.5 m | 7 % | 70 m | 30 m/s |
| **road** | 4.2 m | 8.0 m | 9 % | 45 m | 22 m/s |
| **track** (dirt) | 3.2 m | 6.0 m | 13 % | 24 m | 14 m/s |
| **trail** (foot) | 1.4 m | 2.4 m | 36 % | 6 m | — |

| | km |
|---|---|
| highway | 8.89 |
| road | 11.90 |
| dirt track | 9.47 |
| **total** | **30.26** |

| route | class | km | serves |
|---|---|---|---|
| Route 1 — The Crown City Highway | highway | 6.63 | the spine: Insomnia → Hammerhead → Lestallum |
| Route 2 — The Galdin Road | highway | 2.26 | south across the Vannath Coast to the sea |
| Route 3 — The Slough Loop | road | 4.12 | the Duscae ring through Wiz country |
| Route 4 — The Caem Road | road | 1.13 | down to the southern headland |
| Route 5 — The Cleigne North Road | road | 3.44 | Old Lestallum, the Vesperpool, the Meldacio pass |
| Route 6 — The Ravatogh Ash Road | track | 1.14 | round the pool and up onto the ash |
| Cauthess Spur | road | 1.21 | Coernix Station, the rest area, the Disc overlook |
| Balouve Mine Road | road | 1.18 | the ore road to the shaft heads |
| Formouth Access | road | 0.59 | imperial approach to the garrison gate |
| Vesperpool Causeway | road | 0.23 | a raised bank out to the fishing stage |
| Nebulawood / Keycatrich / Longwythe Peak / Daurell / Costlemark / Malmalam / Perpetouss / Vaullerey / Myrlwood tracks | track | 7.6 | the remote sites |

### Car-friendliness, and how it is enforced

Roads are not drawn on the terrain; the terrain is **cut for them**.

1. **The corridor field.** Before a single landform is stamped, the build
   computes the distance from every macro cell to the nearest road or
   settlement. Every procedural mountain belt in the world is faded out against
   that field, so ranges sit *between* the places the design says people go
   rather than on top of them. This is the single most important structural
   idea in the terrain: it is what stops a range growing across the highway.
2. **Junction elevations are solved first.** Every node gets one elevation,
   relaxed until no edge between two junctions exceeds its class grade, then
   clamped to within 11 m of the real ground — a junction is a place, not a free
   variable.
3. **Profiles are fitted between pinned ends** — smooth, clamp to the ground
   (cut and fill, never a viaduct), then grade-limit *outward from the pinned
   ends*, ten passes.
4. **Turning circles.** Every dead end in the graph has a level apron carved
   at the node and a `parking` POI on it. There are 18 dead ends and 18
   turning circles.
5. **Basins and gorges yield to roads.** A lake floor below sea level is held
   back 105 m from the corridor (Route 3 crosses Alstor Slough on a bank); a
   canyon is held back 78 m (which is exactly what leaves the Taelpar bridge
   neck); the Disc crater is held back 130 m (which is what puts the overlook
   on a spur of the rim rather than in the hole).

`node src/tools/roadcheck.mjs` builds the real heightfield and asserts all of it.

---

## 5. Traversal times

Speeds: walk 2.4 m/s · sprint 5.6 m/s · chocobo 11 m/s · Regalia 26 m/s
average over the road distance (30 m/s cruise on highway).

| from | to | road km | drive | chocobo | sprint | walk |
|---|---|---|---|---|---|---|
| Hammerhead | Longwythe Rest Area | 1.06 | 41 s | 1 m 51 s | 3 m 57 s | 9 m 13 s |
| Hammerhead | Keycatrich Ruins | 1.69 | 1 m 05 s | 2 m 03 s | 4 m 24 s | 10 m 15 s |
| Hammerhead | Coernix Station – Alstor | 1.15 | 44 s | 2 m 00 s | 4 m 16 s | 9 m 58 s |
| Coernix – Alstor | Taelpar Rest Area | 1.09 | 42 s | 1 m 54 s | 4 m 04 s | 9 m 29 s |
| Prairie Outpost | Wiz Chocobo Post | 1.86 | 1 m 11 s | 2 m 33 s | 5 m 26 s | 12 m 41 s |
| Hammerhead | Wiz Chocobo Post | 3.45 | 2 m 13 s | 3 m 45 s | 8 m 01 s | 18 m 43 s |
| Hammerhead | Lestallum | 3.12 | 2 m 00 s | 5 m 25 s | 11 m 33 s | 26 m 57 s |
| Hammerhead | Galdin Quay | 4.07 | 2 m 37 s | 5 m 42 s | 12 m 11 s | 28 m 26 s |
| Hammerhead | Cape Caem | 4.10 | 2 m 38 s | 5 m 12 s | 11 m 06 s | 25 m 53 s |
| Lestallum | Meldacio Hunter HQ | 3.03 | 1 m 57 s | 4 m 19 s | 9 m 13 s | 21 m 29 s |
| Lestallum | Verinas Mart – Ravatogh | 1.79 | 1 m 09 s | 2 m 50 s | 6 m 03 s | 14 m 07 s |
| Galdin Quay | Meldacio Hunter HQ | 10.23 | **6 m 33 s** | 11 m 55 s | 25 m 28 s | 59 m 24 s |
| Crown City Checkpoint | Ravatoghan Trail | 8.92 | **5 m 43 s** | 13 m 24 s | 28 m 36 s | 1 h 06 m |

**Pacing intent.** Outposts are 40–75 s of driving apart along the spine, which
is close enough that fuel and daylight are the pressure rather than tedium. The
two cross-continent runs are 5½–6½ minutes — long enough that the car radio,
the banter and the dusk-to-night transition all get a turn, which is what an
FFXV road trip *is*. On foot the same runs are an hour, which is exactly why
you want the chocobo and the car.

---

## 6. What the terrain now realises, and what is still noise

**Realised from the map (authored, reproducible, moves when the data moves):**
zone biome blending; the corridor field and therefore the position of every
mountain belt; 48 authored landforms (mesas, buttes, hogback fins, spire
groups, Longwythe Peak, the Disc crater, the Ravatogh cone, the Taelpar and
Meldacio canyons, the Lestallum/Old Lestallum/Cotisse/Vesperpool terraces, the
Alstor and Vesperpool lake basins, the Galdin and Caem seas); level pads under
every settlement, rest stop, camp and parking bay; the whole road network's plan,
profile, camber, berm and wheel ruts; the water bodies, which `Water.js`
discovers automatically because the basins are carved below −6.5 m.

**Still procedural noise, deliberately:** the mid-scale rolling relief inside
each zone; the ridged badland belt's exact crest lines (amplitude, style and
extent are authored, the individual peaks are not); hydraulic erosion and its
drainage networks; thermal talus; the 9 000 scattered rock outcrops; the
analytic micro-relief; and the whole frontier beyond ±4 km, which exists only
to be looked at.

---

## 7. Open coordination items

- **`Ecology.worldRadius` caps vegetation at 620 m from the origin**
  (`src/world/veg/Ecology.js:59`, `Math.min(620, …)`). Everything outside that
  is bare ground: Duscae's forest, the Vesperpool's drowned trees and the
  Malmalam thicket have terrain but no plants. That file belongs to another
  workstream; the fix is one number.
- **Bridges and tunnels are terrain, not structures.** The Taelpar crossing is a
  carved neck between two 235 m walls rather than a span on piers. A real deck
  belongs to whoever owns props.
- **Fast travel** is implemented in `WorldMapScreen.accept()` as a teleport plus
  a velocity reset. A proper fade and a load-screen tip belong to the story
  workstream.
