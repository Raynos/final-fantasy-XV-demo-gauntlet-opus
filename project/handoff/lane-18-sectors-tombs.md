# Lane 18 — Sectors and discovery (cold-start brief)

Owns: `src/world/map/WorldMap.ts` (POIS), `RoadGraph.ts` (NODES/ROUTES),
`src/game/encounters/SpawnTables.ts`, `src/world/props/PoiKits.ts` (AFTER
lane 19's H2 anchors commit), new `src/game/rpg/Tombs.ts`, new
`src/tools/probes/tombclaim.mts`. Cross-lane one-liners (own commits):
`Quests.ts` (2 hunts + 2 side quests — AFTER lane 17's spine),
`Chapters.ts:135 PLACES`, `StorySystem.ts:291`, `Foraging.ts:62 POOLS`,
`RegaliaSystem.ts:720`, `probes/longplay.mts` (--night).

## Row formats (copyable)

**POIS row** — `WorldMap.ts:372`. Fields: id, name, type, zone, r
(discovery radius) + x,z OR `at:'<road node id>'` (unknown node THROWS at
load, :918), travel?, lv?, does, gate (zero consumers).
```ts
  { id: 'threshold_stones', name: 'The Threshold Stones', type: 'landmark', zone: 'longwythe', x: 120, z: 900, r: 300, lv: 8,
    does: 'Leaning Solheim milestones on the old pilgrim road south.', gate: null },
  { id: 'old_kingsroad_end', name: 'Old Kingsroad End', type: 'parking', zone: 'longwythe', at: 'n_kingsroad_end', r: 46, travel: true, lv: 12,
    does: 'Turning circle where the south road gives up.', gate: null },
```
Types (:308): town/outpost/reststop/parking/haven/dungeon/menace/tomb/
imperial/chocobo/fishing/landmark; drive:true only town/outpost/reststop/
parking/chocobo. Corpus today: 124 rows.

**ROUTES row** — RoadGraph.ts:156; NODES :75; classes :46 (`trail` =
speed 0, reach 0, maxGrade 0.36, minRadius 6 — never used yet). `path`
alternates node-id strings (open/close an edge) with [x,z] shaping points.
```ts
  // NODES:  j_southroad: [-40, 11], n_pilgrims_rest: [-80, 2600], n_kingsroad_end: [-60, 2860],
  { id: 'route20', name: 'Route 20 — The Old South Road', cls: 'track',
    doc: 'South off the spine into the empty quarter.',
    path: ['j_southroad', [-20, 420], [140, 980], [280, 1880], 'n_pilgrims_rest', 'n_kingsroad_end'] },
```
Join Route 1 by inserting `'j_southroad'` into route1.path **between
`n_hammerhead` and `[-300,-2]`**. `roadcheck` asserts: drivable POIs within
class limit of an edge (town 320 / outpost 220 / rest 90 m); grades;
corner radii; **every 1-edge node needs a parking/town/outpost POI within
90 m** (class-agnostic, `deadEnds()` :660); no road below seaLevel+0.5.

**TERRITORIES / SET_PIECES** (SpawnTables.ts:126 via T() :83 + near()
:113; SET_PIECES :352):
```ts
  T({ id: 'southroad_tusks', name: 'The Old South Road', at: near('threshold_stones', 60, 120), radius: 30,
      when: 'day', level: 8, danger: 1, spawn: [{ key: 'sabertusk', count: [3, 5] }], patrolRadius: 22, respawn: 160 }),
  king_of_the_flats: { id: 'king_of_the_flats', name: 'King of the Flats', kind: 'field',
    at: near('saltgrass_flats', 90, -70), radius: 42, level: 24, boss: 'bandersnatch',
    adds: [{ key: 'sabertusk', count: 3, level: 16 }], music: 'boss-field' },
```
T() defaults: respawn 150, radius 26, when 'any', maxEngaged 2. Widen
`night_giant` at :252 from 0.55 → 0.4. `near()` THROWS on unknown POI —
POI rows land first, always. **Arming a set piece** = a QUEST_TABLE hunt
row with `setPiece:` (pattern `hunt_bloodhorn` Quests.ts:403: reach + kill
at the SAME at() waypoint).

**Tombs.ts** — clone `Deposits.ts`: anchor table like `Elemancy.ts:101
DEPOSIT_SITES` ({id,name,at:'<poiId>'} → worldMap.poiById, throws);
register block `Deposits.ts:240-258` (ix.register {id, pos, radius 6.5,
cone 200, priority 2, verb, label, yOffset 2.2, handler}); installed
lazily from RpgSystem.update's first tick, never init(). Claim grants:
`rpg.inventory.add(armId, 1, 'quest')` (Inventory.ts:546),
`rpg.ascension.awardAp('discovery')` (5 AP; AP_RULES Ascension.ts:139 —
add a tomb key or reuse 'discovery'), `rpg.quests.notify('fetch'|'reach',
{target})`, `hud.toast(...)`, area card via Triggers/ffxv-area. Royal-arm
ids (Inventory.ts:286-321): sword_wise, blade_mystic, sword_father,
axe_conqueror, trident_oracle, star_rogue, bow_clever, shield_just.
**Tomb POI ids vs display names are DELIBERATELY crossed**
(tomb_conqueror="of the Clever", tomb_clever="of the Fierce",
tomb_fierce="of the Wanderer", tomb_mystic="of the Pious", plus
tomb_conqueror2/tomb_mystic2/tomb_just/tomb_wise/tomb_tall/tomb_rogue) —
**pair on the NAME, not the id.**

**PoiKits** — dispatch map in build() (:551) keyed by poi.type; unknown
type = silently no geometry. `_landmark` (:2456) branches on
/lighthouse/.test(id) — add /graveyard/ and /stones/ branches the same
way. Primitives from BuildKit.ts: bag/box/cyl/post/xform/wallRun/plinth/
parapet/basaltColumns/bakeTone/toneVariant + PartBuilder loft/ring/
texelBox + rockGeometry; a torus half via THREE.TorusGeometry (lighthouse
gallery precedent).

**nightDanger** — RegaliaSystem.ts:720, no callers; returns
`p.spawn ? p.density : 0` off daemonPressure. Reuse
`EncounterDirector.spawnRoamer(def)` (:341) — it already picks a bearing
30-42 m out, scales, alerts, and fires the `encounter:warn` HUD event.
Pass `ROAMERS.find(r => r.id==='daemon_pack'|'ronin_duel')` (:289);
`rollRoamer` (:325) already filters on window + depth. Banter:
`story.talk.react('nightfall')`.

**Triggers** — `triggers.add({kind:'place'|'region'|'hour'|'quest'|
'combat', id?, once?, run})`, polled 4 Hz. **Trap: places() resolves
`Chapters.ts:135 PLACES` against ECOLOGY SITE types, not POIs** — a new
landmark needs a PLACES row {id,name,sub,site,radius} or it can never
fire. Area card = `window.dispatchEvent(new CustomEvent('ffxv-area',
{detail}))` (StorySystem.ts:294). Read plaque = an interactable, copy
`Hammerhead.ts:1094-1110` (`ix.say({speaker, nodes:{a:{lines,next:null}}})`).

**Gates.** roadcheck; drawcheck (--set-baseline only LOWERS; on a subset
it DELETES unmeasured entries — full corpus or nothing); perfpoi (33 ms
per site); reachcheck + must-run.json (add Tombs rows). **No gate
hard-codes 124** — every literal 124 found is prose; update in one sweep.

## Anchors per task
- 57 south: POIS ×5 → :372; j_southroad + terminals → RoadGraph:75; route
  → :156; 2 T() + set piece + night_giant widen; rank-3 hunt +
  side_old_road → Quests.ts (after lane 17).
- 58 NE: route (trail) + 3 POIs + graveyard branch in _landmark;
  graveyard_watch/peak_coeurls territories.
- 59-62: POIS + T() rows; saxham Read plaque; disc_rim_overlook place
  trigger.
- 63 Tombs.ts + tombclaim probe. 64 nightDanger. 65 Elemancy micro-rows,
  Foraging weight, PLACES rows, plaques.

## Commands
```
node src/tools/roadcheck.mts            # ~1 min, builds the real field
node src/tools/drawcheck.mts --worst 30
node src/tools/probe.mts probes/perfpoi.mts
node src/tools/probe.mts probes/tombclaim.mts
node src/tools/probe.mts probes/longplay.mts --ttl 40 --turbo
node src/tools/reachcheck.mts
pnpm typecheck && node src/tools/check.mts
```

## First commits
1. NODES + route20 + Route 1 junction insert (expect the dead-end failure
   until commit 2).
2. Five south POIS rows incl. the parking terminal; roadcheck + drawcheck
   green.
3. Territories + set piece + night_giant widen; hunt/side rows (own
   pathspec, after lane 17 releases Quests.ts).
4. Tombs.ts + tombclaim + must-run entries.
5. Route 21 (trail) + NE POIs + bone-arch branch.
6. nightDanger wiring; PLACES/Triggers/plaques/micro-deposits.

## Landmines
- **`route19` already exists** ("Vesperpool Causeway", RoadGraph.ts:268) —
  use ids route20/route21.
- **Route 1's Z must decrease monotonically westward** (comment :76). The
  plan's junction z=30 breaks it — use z ≈ 11.
- Dead ends are class-agnostic: a trail terminal needs a parking POI
  within 90 m, or author the trail as shaping points off an existing node.
- `trail` has reach 0 / speed 0 — never hang drive:true off one;
  RoadGraph.nearest() is class-agnostic and will hide unreachability.
- **Corridor carving is automatic AND suppresses ridge belts near roads**
  (Field.ts:894) — a 2.9 km track flattens a 59° arc of Leide; re-shoot
  affected corpus categories, expect terrain diffs beyond the road.
- PAD radii (PoiKits.PAD_R:403) plateau vegetation via Ecology.ts:176
  with PAD_SKIRT 2.2 — a big landmark r clears a big veg hole; check
  probes/padclear.mts.
- SKIP_IDS (:140) — any POI co-located with lane 19's hand-built city
  geometry must be added or you get a kit inside a set.
- `old_book` is ALREADY in the rock pool (Foraging.ts:77) — task 65 needs
  a weight/second entry or a south-biased pool, not an insertion.
- _landmark's stele takes no apron — steep sites sag (longwythe_peak's
  17.5 m precedent).
- PREBUILD pays at boot — the plan's ≤1 non-light kit per 2400 m draw
  radius is the budget.

## Done-when
roadcheck 0 failures with both routes + all new drivable POIs; drawcheck
under baselines and 800; perfpoi no site over 33 ms; reachcheck visits 10
tombs; tombclaim claims 8 arms and ArmigerScreen lists them; longplay
--night 30 min with the road daemon roll firing; POI count ~137 with the
prose 124s updated in one sweep; each new landmark fires exactly one
ffxv-area card; three Read plaques answer via ix.say.
