# Lane 21 — Content shots (`src/game/Shots.ts`)

Plan `docs/plans/2026-08-30-fable-to-nine.md` item 69: 32 new corpus shots
(142 → 174), five joining `compare.mts` PAIRING.

Status: **in progress**, 2026-08-31.

## Ownership

`src/game/Shots.ts` (released by lane 3 at `e5db679`), `src/tools/compare.mts`
PAIRING rows, `project/noise-floors.json` rows for the new shots.

## Order of work (coordinator's, and it is right)

1. **14 city shots first** — lane 19 has landed both hubs and wrote the exact
   framings it wants into `project/handoff/lane19-cities.md`.
2. **The 6 arc shots whose subjects exist**: `tomb_claim`, `armiger_full`,
   `dungeon_keycatrich_fight`, `dungeon_balouve_boss`, `regalia_night_road`,
   `map_drive_there`.
3. **The remaining 12 arc shots wait on lane 18** — `threshold_stones`,
   `saltflat_setpiece`, `peak_overlook`, `adamantoise_graveyard`,
   `graveyard_night`, `northwatch_ruin`, `mencemoor_obelisks`,
   `washes_lookout`, `saxham_ghost`, `south_road_dawn`, `southwatch_camp`,
   `pilgrims_rest`. Shooting them before its kits land photographs bare ground.

## Measured so far

`framecam --probe tmp/l21/anchors.mts` — live anchor world positions, **verified**:

```
Lestallum  plaza [-2960.0, 121.22, -700.0]  ground around it 120.1–121.2
  stall0 [-2952.5,-702.3] stall1 [-2954.3,-694.7] stall2 [-2961.8,-692.4]
  stall3 [-2967.5,-697.7] stall4 [-2965.7,-705.3] stall5 [-2958.2,-707.6]
  edge0 [-2951.7,-695.2] edge1 [-2960.0,-690.4] edge2 [-2968.3,-695.2]
  edge3 [-2968.3,-704.8] edge4 [-2960.0,-709.6] edge5 [-2951.7,-704.8]
  light0..5 at y 124.94, r ≈ 11
Galdin Quay plaza [2330.0, 14.01, 2380.0]  ground around it 12.8–14.1
  stall0 [2336.9,2376.2] stall1 [2336.7,2384.1] stall2 [2329.8,2387.8]
  stall3 [2323.1,2383.8] stall4 [2323.3,2375.9] stall5 [2330.2,2372.2]
  edge0 [2339.1,2383.0] edge1 [2331.9,2389.4] edge2 [2322.8,2386.4]
  edge3 [2320.9,2377.0] edge4 [2328.1,2370.6] edge5 [2337.2,2373.6]
  light0..5 at y 17.74
```

Both plazas are small: anchors sit inside a ~10 m radius, so a city framing is a
12–25 m camera, not a vista.

## Landed

- **`d622af7`** — 11 city shots + 6 arc shots (142 -> 159).
- **`c29ed18`** — `lest_overlook_disc`, `galdin_angelgard`, `galdin_beach`
  (-> 162), the five PAIRING rows in `compare.mts`, one `HUMAN_REVIEW.md` line.

**20 of the 32 are in.** The 12 that are not are lane 18's subjects
(`south_road_dawn`, `threshold_stones`, `southwatch_camp`, `saltflat_setpiece`,
`pilgrims_rest`, `peak_overlook`, `adamantoise_graveyard`, `graveyard_night`,
`northwatch_ruin`, `mencemoor_obelisks`, `washes_lookout`, `saxham_ghost`).
Lane 18's own handoff (2026-08-31) says its two authored landmark kits have art
defects it is mid-fixing — the ribs "read as two tall tapering spikes, not an
arch", the milestones "look like bollards, not Solheim" — so shooting them now
would put twelve frames of known-bad geometry into every contact sheet and every
judged round. **They are the next agent's first task, after lane 18 says its
kits are fixed.** Framings to start from are in the "Left to do" section below.

## Method, and the four numbers a successor needs

Everything below is **verified by eye** unless it says otherwise. 26 candidate
framings through `framecam.mts` in six batches; every frame read as a JPEG.

1. **Both city squares are small: ~10 m of anchors, blocked at ~13 m.** Nine of
   the 26 candidates came back as the inside of a wall, and one pair a metre
   apart straddled the line — `(-2968, 122.1, -707)` is the lit night square,
   `(-2967, 122.7, -708)` is a dark wall. Re-derive, never nudge.
2. **Galdin's plaza is a raised deck**: `town_poi_paving` sits at y ~ 0.55 over
   ground reading -0.4 after streaming, so eye height on it is y ~ 2.3.
   Lestallum's is the ordinary `PLAZA_Y` 0.675 over 120.5 -> eye y ~ 122.9.
3. **`terr.heightAt` at Galdin returns 12.93 before the site has streamed and
   -0.4 after.** A 13 m error. Take heights *after* the settle loop, or a
   `camAt`/`eye` recipe resolves the camera 13 m in the air.
4. **The Meteor's numbers, from `probes/discview.mts`:** crown y 829, waist 80,
   foot -324, rim 173. From the Lestallum shelf the terrain skyline cuts at
   ~316 m, so the shot is the upper ~60% of the cluster and never the crater.
   The one stand in the 24x5 sweep that sees the rim is `n_disc` at eye 300
   (frac 0.82), 825 m out and among the rim blocks.

## What the frames showed (each read)

- **The plaza paving — lane 18's `pavingMaterial` (`f947649`) — READS, and this
  was the first look at it.** Lestallum: cream flags, half-course offset, per-slab
  jitter. Galdin: the same material blue-grey. A large improvement on the flat
  plane lane 19 reported. **Note, not a defect:** the joints are very dark and
  the flags read large for a market square.
- `lest_market_day` — six people at four depths, awning left, stall right, pink
  and blue building faces, festoon across, sky top-left. The first version of
  this framing had a black post eating the right 12% of the frame; moving the
  camera 1.5 m along its own left axis cleared it.
- `lest_street_night` — starfield, warm bulbs on the catenary, lit windows,
  three silhouettes. One body reads as a featureless black blob because it
  stands between the camera and the only light.
- `galdin_night_lanterns` — the best night frame of either city: festoon, eight
  people, stalls, buildings receding into a starfield.
- `galdin_angelgard` — golden light on the clouds, the island on the right
  third with its crag, a boulder left, the jetty bottom-right, birds. **Defect,
  not mine:** the water has a hard horizontal edge where the far band goes
  near-black against a lit near band.
- `galdin_beach` — two wind-cut trees, sand and scrub, the shallows, Angelgard
  on the horizon. Clean.
- `tomb_claim` — the sarcophagus on its dais under the colonnade with the
  badlands beyond. **Defect, not mine:** an orange dome sitting in a grey cone
  beside the steps reads as a placeholder.
- `armiger_full` — thin type, thirteen blades, AP costs, the gauge at right.
  Handsome. **Defect:** a tutorial card ("WHERE YOU ARE") sits over the detail
  pane in every `framecam` frame; see "Open questions".
- `lest_overlook_disc` — at `E_disc_d` this was the best frame of the night: a
  glowing mass, the dreadnought crossing it, foreground trees, starfield.
  Twenty minutes later the same camera returned a white ellipse. Lane 20 is
  tuning fissure radiance live; the stand and framing are measured, the
  exposure is theirs.

## Not done / left to do

1. **The 12 lane-18 arc shots.** Wait for its kit fixes, then frame from
   `tmp/lane18/probe2.mts`'s output (it derives framings in each site's own
   local frame, which is the only way to frame a seeded yaw).
2. **`lest_exineris` is not verified.** The EXINERIS *POI* at (-3120, -540) has
   no built geometry at all — a framing there is a green hillside. The stack is
   `_town`'s own, at plaza + 22u - 18v = (-2938, -718), 34 m tall, and the
   committed framing stands outside the block at (-2908, 128, -742). Unverified.
3. **`lest_leville`, `lest_market_vendor`, `lest_plaza_walk`,
   `galdin_restaurant`, `galdin_pier_fishing`, `galdin_pier_sunset`,
   `lest_night_high`, `map_drive_there`, `regalia_night_road`,
   `dungeon_keycatrich_fight`, `dungeon_balouve_boss`** were committed from
   derived framings but the corpus capture had not returned when this was
   written. **Read `tmp/shots/l21-new` and fix any that are walls.**
4. **Noise floors for the five judged rows are NOT measured.** Two `--cold`
   captures + `imgdiff --calibrate`, rows into `project/noise-floors.json`.
5. `drawcheck` on the 20 new shots: not run. A new shot over 800 CREATES
   `project/draw-baseline.json` — check before running it.

## Cross-boundary / reported

- **`PoiKits.anchorAt('galdin_quay', ...)` returns y = 14.01** while the built
  paving disc is at y ~ 0.5. Lestallum's anchors are consistent (121.22 = 120.55
  + `PLAZA_Y`); Galdin's are ~13.5 m high. Lane 19's `cityanchors` tests for
  surfaces between anchor+0.35 and anchor+1.85, so an anchor 13 m in the air
  reads "OPEN, 8/8 approach" — its Galdin pass may be a **false pass**. Nothing
  is visibly broken (the bodies do stand on the deck in every frame), so this is
  the anchor number, not the placement. For lane 19 / the coordinator.
- **`framecam.mts` cannot preview a `dungeon:` shot.** Both dungeon candidates
  came back as the underside of the open-world terrain at y -46. `Dungeons`
  reads `game.currentShot`, which is `__probe`, and the enter never happened.
  Use `shoot.mts` for dungeon framings, or teach `framecam` to enter.
- **A tutorial card renders over `framecam` frames** ("WHERE YOU ARE", "THINGS
  YOU CAN USE") even with `hud` unset. `applyShot` clears `hud.toasts` but these
  are not toasts. If they also appear in `shoot.mts` output they are on every
  new UI shot and want an owner.
- **`HUMAN_REVIEW.md`** gained the plate-library line (see the commit).

## Files owned / touched

Owned: `src/game/Shots.ts` (from lane 3 at `e5db679`), `src/tools/compare.mts`
PAIRING rows, `project/noise-floors.json` (not yet written).
Touched: `HUMAN_REVIEW.md` (one line).
Commits: `d622af7`, `c29ed18`.
