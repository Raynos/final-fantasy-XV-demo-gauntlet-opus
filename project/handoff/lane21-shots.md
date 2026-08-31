# Lane 21 — Content shots (`src/game/Shots.ts`)

Plan `docs/plans/2026-08-30-fable-to-nine.md` item 69: 32 new corpus shots
(142 → 174), five joining `compare.mts` PAIRING.

Status: **in progress**, 2026-08-31 (second agent).

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

## Measured

- **`nanscan` — `0 of 162 shots carry NaN`.** Verified, at `bc52a46`.
  (162, not 174: 20 of the 32 are in; see above.)
- **All 20 new shots capture clean, zero console errors**, `tmp/shots/l21-new`,
  one pass at one sha (`bc52a46`), 87 s of run behind 973 s of queue.
  Draw calls, against the 800 budget:

```
armiger_full 594   map_drive_there 592   tomb_claim 414
regalia_night_road 624   dungeon_keycatrich_fight 143   dungeon_balouve_boss 132
lest_market_day 551   lest_street_night 730   lest_overlook_disc 504
lest_plaza_walk 607   lest_exineris 461   lest_leville 479
lest_market_vendor 472  lest_night_high 480
galdin_pier_sunset 471  galdin_angelgard 412  galdin_beach 444
galdin_restaurant 442   galdin_pier_fishing 439  galdin_night_lanterns 472
```

  **Worst is `lest_street_night` at 730 of 800**, which matches lane 19's own
  `citydraws` reading of 730 for the same square at night. No new shot needs a
  `project/draw-baseline.json` entry, and that file still does not exist —
  which is the outcome the brief asked for.

## What the CORPUS capture showed, and the fix pass

**The preview tool and the corpus disagree, and the corpus is the one that
counts.** All 20 were captured through `shoot.mts` and read as JPEGs. Ten were
broken or weak. Fixed in `8b52a85`:

1. **Four Galdin cameras were UNDER the deck**, photographing its planks from
   below, after previewing correctly in `framecam`. `PoiKits._make` runs at
   BUILD_R against `Terrain.heightAt`, which reads **12.93** at the Galdin pin
   before the clipmap settles there and **-0.4** after; `framecam` built the
   site at y ~ 0.55 and `shoot` at y ~ 14. `anchorAt('galdin_quay','plaza')`
   says 14.01 and agrees with the corpus. **Derive a Galdin camera from
   `anchorAt`, never from `Terrain.heightAt`, and check it in `shoot.mts`.**
   This also settles the "false pass" question filed earlier: the anchor is
   right and my `heightAt` reading was the wrong one.
2. **Neither dungeon fight had a fight in it.** `Dungeons._arm` spawns on the
   party and arms a boss when the party walks into its room. A shot moves the
   camera, not the party, so a fixed camera in a dungeon room photographs an
   empty room forever. Both are now `follow: 'player'` + a scenario.
3. `lest_market_vendor` had the camera inside an NPC's forearm; `lest_night_high`
   was 60% flat roof and read as a level-editor viewport; `lest_exineris` had a
   black featureless stack dead centre bisecting the frame; `lest_leville`
   cropped both bodies mid-thigh so the shot had no ground plane;
   `lest_plaza_walk` cropped a body in half on the right edge;
   `regalia_night_road` had the car as a hundred-pixel speck; `tomb_claim`
   caught a deposit marker and a floating prompt quad.

**Re-captured to `tmp/shots/l21-fix`. NOT yet read — that is the next agent's
first job.** If a Galdin frame is still wrong, the deck height moved again.

## Defects found that belong to other lanes

- **Every Lestallum body is cut off at mid-shin, no shoe, no contact shadow.**
  Confirmed with four figures in `lest_market_day`, four in `lest_street_night`,
  three in `lest_plaza_walk`. Lane 19 is on it. **`lest_market_day`,
  `lest_street_night` and `lest_plaza_walk` are three of the five judged rows
  and must be re-read after the fix.**
- **`tomb_claim`'s kit is an untextured clay blockout** with an orange
  placeholder sphere on a grey cone beside the steps and an unattached pale-blue
  quad floating over the colonnade. Lane 18's `_tomb`.
- **`landmark_meteor` clears 0.09 of its own subject** (lane 20's measurement,
  confirmed by eye: the crown over a sunlit ridge, no crater, no rim). I did not
  re-frame it — re-framing re-baselines a judged shot and there was no time to
  do it with an `imgdiff` — but the sweep's stands are in `discview` output and
  the successor should. **Filed for the coordinator.**
- `map_drive_there` draws placeholder travel figures ("0.03 km · 1 s").
- The night sky's stars render as fat white blobs the size of boulders over
  torn black-and-white cloud noise, in every night frame.

## The second read, and the honest state of the 21 shots

Every frame was re-captured through `shoot.mts` after the fix pass and read
again. **Nothing in the set is shippable as it stands**, and the reviewer's
words for the three closest are "within one fix of it": `regalia_night_road`,
`galdin_night_lanterns`, `lest_overlook_disc`.

**Fixed by the fix pass, verified:** the four Galdin cameras are on the deck
now, not under it — three of them frame the square with its people, its stalls
and its bulbs. `lest_overlook_disc` contains **both** the Meteor and Lestallum's
roofs, which is what its name promises and what the first stand did not have.

**Broken by the fix pass, fixed again in `6d39721`, NOT re-verified:**
`galdin_restaurant` (13.5 m from the plaza centre = inside the block, flat grey)
and `lest_market_vendor` (11.6 m, flat maroon) — both moved back inside the
12 m radius this file's own comment warns about, and `tomb_claim`'s tighter fov
put the camera on the coffin lid, so it is back to the wider framing.

**The two dungeon shots are renamed** to the rooms they can hold. `follow` plus
a combat scenario was authored, captured and read: the scenario does not restore
the interior lighting and both came back 99% black with a combat HUD over
nothing. See `project/TASKS.md`.

### The defect list a successor should work down, worst first

Everything here was seen in a frame. Most of it is not framing.

1. `galdin_restaurant`, `lest_market_vendor`, `tomb_claim` — re-verify `6d39721`.
2. **The party/NPC idle animation is broken**: NPCs stand with both arms raised,
   palms out, legs straight, in `galdin_pier_fishing` and `lest_plaza_walk`.
3. **Every Lestallum body is cut off at mid-shin** with no shoe and no contact
   shadow. Lane 19.
4. **An NPC intersects a building wall** in `galdin_pier_fishing`.
5. **The night sky's clouds render as ragged black blobs with vertical smear
   artefacts over the starfield**, and the stars as fat white sprites. Visible
   in `lest_overlook_disc` and `regalia_night_road`; it is the single thing
   dragging both night frames down.
6. **The Regalia's headlight pool is a hard-edged blown-white blob** with no
   cone or falloff, larger in frame than the car.
7. **The festoon bulbs are octagonal low-segment discs** and the nearest blows
   out with no bloom. `galdin_night_lanterns`.
8. **The EXINERIS stack has no material at all** — a pure-black column. So do
   the `_town` roof planes, which is why `lest_night_high` reads as a level
   editor viewport.
9. **`tomb_claim`'s kit is a clay blockout** with an orange placeholder sphere
   and a floating cyan quad in frame. Lane 18.
10. **`landmark_meteor` clears 0.09 of its own subject** — the crown over a
    ridge, no crater. Not re-framed here; the stands are in `discview`'s output
    and re-framing re-baselines a judged shot, so it wants its own commit with
    an `imgdiff`.

## The 12 arc shots: what was measured, and why none landed

`tmp/l21/arc.mts` (kept) streams each site in, takes the world-space extent of
the built props within 130 m of the pin and derives two framings from it. Nine
sites, eighteen frames, all read. **Six of the eighteen contain no authored
landmark at all**: both `peak_overlook`, both `southwatch_haven`, both
`saltgrass_flats`, both `pilgrims_rest` — woodland and terrain with nothing man-
made in them. That is a missing-prop or wrong-pin problem, not a framing one,
and it is lane 18's to answer. `saxham_ghost` **has no POI in `WorldMap` at all**.

Corrected second-pass framings were shot for the four sites that do have
geometry (`tmp/shots/l21-i`, all read):

- `northwatch_ruin` — `I_northwatch_b`, `pos [110, 52, -3146] target [150, 57,
  -3098] fov 50`, storm, t 13.2. Outpost legible at ~35% of frame height. **The
  best of the eight**, and still an unlit black silhouette with no albedo.
- `washes_lookout` — `I_washes_b`, `pos [690, 18.2, 659] target [702, 19.8, 645]
  fov 38`, t 17.4. Marker at ~45%, campfire and cairn balanced. The shrine is
  untextured beige and reads as a greybox.
- `threshold_stones` — `I_threshold_b`, `pos [78, 31, 864] target [121, 33.5,
  910] fov 38`, t 8.6. Eight stones plus a fallen one at ~30%. Every stone is a
  flat black silhouette, and they cluster rather than march over a ridge.
- `mencemoor_obelisks` — **neither candidate is enterable.** The obelisks are
  under 5% of frame height at 22% of the derived standoff, and both frames
  contain a **bright blue untextured LOD box** at the left edge.

**None was committed, on purpose.** A corpus shot that is structurally valid and
ugly is in every contact sheet and every judged round from now on; three
greybox landmarks and one invisible one are worse than four absent rows. The
framings above are measured and ready — land them the moment lane 18's material
pass makes them worth looking at.

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


---

# Second agent, 2026-08-31

## What this agent found before shooting anything

**`saxham_ghost` is not missing — the POI id is `saxham`.** `WorldMap.ts:747`:
`{ id: 'saxham', name: 'Saxham Outpost', type: 'landmark', zone: 'weaverwilds',
x: -1620, z: 640, r: 200, lv: 22 }`. The predecessor searched for `saxham_ghost`
(the *shot* name) and correctly reported "no POI"; the subject does exist.

**The "NO BUILT PROPS within 130 m" reading is suspect and is being re-measured
with a different instrument.** `tmp/l21/arc.mts` traversed the *scene* and
filtered by world-space distance from the pin. `PoiKits._make` has a branch that
sets `site.group = new THREE.Group()` and returns when a POI falls inside
`_exclude`'s radius — an **empty group**, which is a different fact from "never
built" and from "built but the traverse missed it". `tmp/l21/sites2.mts` asks
`PoiKits.sites` directly for `site.group`, counts its meshes and takes a
`Box3.setFromObject`, so it can tell the three apart. `tmp/l21/arcframe.mts`
derives framings from that same Box3 **plus a twelve-bearing terrain-clearance
march** (the `discview` trick), so a foreground ridge cannot eat a subject the
way it eats `landmark_meteor`.

Note the generic `_landmark` tail (`PoiKits.ts` ~2965-3040) builds a waymark
stele, a cairn, a bench and field boulders at `r: 9` for *every* landmark with no
named branch — so `peak_overlook`, `saltgrass_flats`, `saxham` and
`mencemoor_obelisks` should all have something. A haven and a reststop build far
more. "Nothing man-made" at four of them therefore reads as an instrument
problem, an exclusion, or a streaming failure — not as absent content.

## `landmark_meteor` re-frame: the stand this agent will test

`tmp/l21/discview.log`'s ring, read in full. The current pose (-1020, 150, -3560)
clears **0.09**. The ring's best are:

| stand | range | frac | fov | note |
|---|---|---|---|---|
| (-3618, 211, -660) | 3.0 km | 0.50 | 39 | **duplicates `lest_overlook_disc`** |
| (-3420, 126, -2160) | 2.4 km | 0.43 | 47 | due west; front-lit at t 17.6 |
| **(1980, 51, -2160)** | 3.0 km | **0.42** | 39 | **due east — backlit at t 17.6, which is what the shot's own `doc` promises** |
| (712, 126, -1160) | 2.0 km | 0.41 | 55 | NE |

Only `n_disc` high (eye 300) reaches 0.82 and that stand is already
`disc_crater_night`. So the honest ceiling for a *daylight* Meteor shot that is
not a duplicate is ~0.42-0.43, against 0.09 today — a 4.7x improvement, and
`MT_e` is the only one of them that is backlit. Candidates are in
`tmp/l21/roadmeteor.mts`; **not yet read.**

## Queue state at the time of writing

`daemon --health`: sweep depth 29 (21 prewarm, 5 drawcheck), fix depth 5. Three
of this lane's jobs are in it. Every harness line is being checked against
`git rev-parse HEAD` per LANDMINES.

## HARNESS STALL, 2026-08-31 02:05 — FOR THE COORDINATOR

`daemon.mts --health`, read three times over eleven minutes:

```
workers  {busy: 0, total: 4}
exclusive: perf     leases: [{holder: 'perf', secLeft: 409, cpu: 0}]
idleSec: 501
queue: fix depth 9 · sweep depth 29 (21 prewarm, 5 drawcheck, 2 texbake, 1 sheet)
totals: exclusiveWaitSec 1025, exclusiveHeldSec 1321, queuedSec 54023 vs ranSec 11099
```

**Four idle workers and thirty-eight queued jobs.** `node src/tools/perf.mts
--build cf163cb` (pid 14993, alive 10:59) holds the exclusive lease with **zero
CPU for 501 s**. An exclusive lease blocks every lane, so nothing on the box is
moving; `queuedSec` is now **83% of all harness time tonight**, up from the 60%
lane 18 recorded. This lane's three jobs have been queued ~30 min without
starting.

Not killed: it is another lane's job and its TTL frees it in ~7 min. But a perf
run that goes to zero CPU while holding the exclusive lease is a harness fault
worth a `LANDMINES` row if it recurs — it is indistinguishable, from every other
lane's side, from "the daemon is fine, your job is just slow".

## MEASURED, AND IT OVERTURNS THE PREDECESSOR'S HEADLINE FINDING

**All eleven arc sites have built geometry. None is empty.** `tmp/l21/arcframe.mts`
asks `PoiKits.sites` for `site.group`, counts the meshes under it and takes the
box from the group's own children (`framecam --out tmp/shots/l21-arc`, sha
`00c25ddc6bd0`, ran 9.6 s):

```
TH threshold_stones      landmark meshes=5  span=50 m  top=+8.3   standoff 75
GY adamantoise_graveyard landmark meshes=3  span=102 m top=+16.8  standoff 153
NW northwatch_ruin       imperial meshes=14 span=89 m  top=+16.8  standoff 133
MO mencemoor_obelisks    landmark meshes=6  span=13 m  top=+3.8   standoff 26
WL washes_lookout        landmark meshes=6  span=12 m  top=+2.5   standoff 26
SX saxham                landmark meshes=6  span=14 m  top=+4.0   standoff 26
PK peak_overlook         landmark meshes=6  span=15 m  top=+3.9   standoff 26
SF saltgrass_flats       landmark meshes=6  span=13 m  top=+3.4   standoff 26
PR pilgrims_rest         reststop meshes=14 span=50 m  top=+10.6  standoff 75
SW southwatch_haven      haven    meshes=12 span=50 m  top=+4.6   standoff 75
```

The four sites the predecessor reported as "NO BUILT PROPS within 130 m" —
`peak_overlook`, `southwatch_haven`, `saltgrass_flats`, `pilgrims_rest` — have
**6, 12, 6 and 14 meshes** respectively. `pilgrims_rest` is a 50 m reststop with
a 10.6 m tall thing in it. So the earlier reading was an instrument artefact of
walking `g.scene` and filtering meshes by name and by world distance from the
**map pin**, and four rows were nearly cut from the corpus on the strength of it.
`saxham` (id `saxham`, not `saxham_ghost`) has 6 meshes too.

**The lesson, worth a LANDMINES row: ask the system that built the thing whether
it built it.** `PoiKits` publishes `sites[].group`, and `_make` gives an *empty*
group to a site inside `_exclude`'s radius — so the three facts a scene traverse
conflates (excluded, never built, built but missed) are each separately
observable from the system's own side.

Every framing is also picked by a **twelve-bearing terrain-clearance march** —
step `Terrain.heightAt` from the eye to the subject's own top and count blocked
samples — so a foreground ridge cannot eat a subject the way one eats
`landmark_meteor`. Only three sites have any blocked bearing at all
(`southwatch_haven` 4 of 12, `saltgrass_flats` 1, `adamantoise_graveyard` 1), and
the picks avoid them.

**The 22 candidate frames are in `tmp/shots/l21-arc/`; being read now.**

## `landmark_meteor` — RE-FRAME REFUSED, WITH EVIDENCE. This closes item 3.

The brief was: re-frame it if I judge it right, in its own commit with an
`imgdiff`. **I judge it wrong, and here is why.**

Six candidate stands were captured (`tmp/shots/l21-rm/MT_*.jpg`, all read) at the
four best rings `probes/discview.mts` found — due east 3.0 km (frac 0.42), due
west 2.4 km (0.43) and north-east 2.0 km (0.41) — each at two aim heights. Then
the **current** shot was captured through `shoot.mts`
(`tmp/shots/l21-met/landmark_meteor.jpg`, sha `ededb69eceb3`, 619 draws) and read
beside them.

**The current frame is better than all six.** In it the Meteor's crown is a dark
faceted mass at roughly **28% of frame height** with its blue fissures clearly
lit, standing over a big sunlit ridge that has real texture and depth. In every
0.41-0.43 stand the Meteor is 2.0-3.0 km away, aerial haze has washed it to
almost exactly the sky's own value, and it reads — the reviewer's words, and mine
— as *one more distant mountain*. None of the six shows the crater or the rim
either, because from the whole ring only `n_disc` at eye 300 does, and that stand
is already `disc_crater_night`.

So **the 0.09 figure is a terrain-clearance metric, not a picture-quality one.**
It measures how much of the mass's vertical extent clears the ground between
here and there. It does not measure angular size, contrast against the sky, or
whether the fissures read — and on all three of those the 0.09 stand wins,
because it is 1.4 km out instead of 3.0 and the ridge it stands over is what
gives the mass its scale.

Re-framing to a better clearance number would have made the shot worse and
re-baselined a judged row to do it. **Not done, on purpose.**

The real defect in that frame is not the framing: **a large hard-edged flat tan
slab floats detached in the air at the left of the plate**, and two smaller ones
at the right edge. Terrain LOD, not this lane. Same artefact on the distant
mountains in four of the six candidates.

## `south_road_dawn` — LANDED (`6d3cf46`), verified by eye

The 22nd shot. Frame read: a pale gravel track sweeps out of bottom-centre and
bends left past a treeline, marker stones step down the left verge, a signboard
and a rock cairn hold the bottom-left, a treed ridge closes the right and blue
mountains sit far left. It reads as a road going somewhere, which four of the six
candidates did not.

**Filed against another lane, seen in the frame:** at t 6.9 the sky is **full
midday blue with no dawn gradient and no warm horizon**, while the terrain
lighting does respond to the low sun. `vista_dawn` (6.4) and `daycycle_dawn`
(5.9) sit at the same hour, so this is corpus-wide. Also in the frame: the
clouds show vertical comb/smear artefacts, and one hard unattenuated white light
sprite in the left mid-ground.

## The twelve arc shots: THREE LAND, NINE ARE REFUSED, and every refusal has a frame

All 22 first-pass frames and all 16 second-pass frames were read as JPEGs.

### Landed and verified by eye

| shot | commit | framing | what the frame shows |
|---|---|---|---|
| `south_road_dawn` | `6d3cf46` | Route 20 south leg, fov 54 | the track sweeps out of bottom-centre and bends left past a treeline, marker stones down the left verge, a signboard and a cairn bottom-left, blue mountains far left |
| `threshold_stones` | `6e34044` | frac 0.48, alt bearing, fov 44 | the felled milestone across the left foreground with its chevrons legible, one stone at centre with three collar bands, four marching right over the ridge against sky |
| `northwatch_ruin` | `6e34044` | frac 0.34, storm, fov 44 | crenellated curtain wall, barrel-vaulted hangar, two stilted watchtowers with orange lamps, lightning striking the mountain behind, rain |

### The rule that got the last two there, and it is worth keeping

**Scale the standoff to the subject's HEIGHT, not to the site's span.** The first
pass used `span * 1.5` — 102 m at the graveyard, 89 m at the garrison — which put
a 16.8 m building at 133 m and **16% of frame height**. Every first-pass frame
had the same fault: a correct subject, small, on the horizon, over half a frame
of dead ground. `d = top / (2·tan(fov/2)·frac)` fixes it, and the right `frac` is
per subject, measured: Northwatch is a silhouette-and-sky subject and wants
**0.34** (at 0.48 the flanking towers leave the frame; at 0.66 the shot is four
crenellation blocks and 80% black), the Threshold Stones are a procession and
want **0.48** on the *alternate* bearing (straight on, the ridge crest sits behind
them and every silhouette dies against green).

### Refused, and why — nine subjects

**Five are the same greybox, five times.** `washes_lookout`, `saxham`,
`peak_overlook`, `saltgrass_flats` and `mencemoor_obelisks` have no named branch
in `PoiKits._landmark`; they all fall through to one shared tail that builds a
waymark stele, a cairn, a bench and field boulders. In the frames the stele is a
**flat untextured beige box**, the cairn is **stacked grey cubes**, and the five
sites are indistinguishable from one another. `saltgrass_flats` additionally is
not a dry lake pan — it is a grassy treed slope — and `peak_overlook` has no
"half of Leide below you"; its own hill fills the horizon.

**Two are blockouts.** `pilgrims_rest`'s shop is a plain white-grey box with no
door, no windows and a **blank white sign board on a post**, at 13% of frame
height. `southwatch_haven`'s camp is a **6-7% grey slab pad** with no fire, no
tent and no read at all.

**Two are lost to the skyline.** `adamantoise_graveyard` and `graveyard_night`
are the best kit lane 18 built — the rib arches do read as pointed arches, the
carapace does read as a shell — and **every one of eight frames on four bearings
has two window-gridded glass office towers standing in the field behind them**,
self-lit at night and the brightest thing in the plate. The second pass
deliberately stood on the bearing *toward* Insomnia so the city would be behind
the lens, and the towers were still there and larger. See the note below: they
may not be Insomnia at all.

**None of the nine is a framing problem, and no framing fixes any of them.** That
is the whole finding: the corpus is not short of nine framings, it is short of
one landmark material, one shop, one haven kit and one draw-distance decision.

## RETRACTION: "the sky does not turn at dawn" was a WRONG DIAGNOSIS

Filed a few hours ago, in this file, in a commit message and very nearly in
`HUMAN_REVIEW.md`: *at t 6.9 the sky renders as full midday blue with no dawn
gradient, while the terrain lighting does take the low sun.* **It is wrong.**

`vista_dawn` (t 6.4) was captured in the same `shoot.mts` run as
`south_road_dawn` (`tmp/shots/l21-sr/`) and is a **full gold sunrise** — the sun
disc on the horizon, warm cloud undersides, a band of ground mist, Insomnia's
towers in silhouette. The sky model is fine.

The difference is **azimuth**, and it is physically correct. Route 20 runs
north-south, so every stand on it looks north or south — away from an eastern
sunrise — and gets dawn's raking light on the country under a blue sky. To test
it rather than argue it, nine more candidates were shot on the three legs
**reversed** so the sun would be ahead of the lens (`tmp/shots/l21-sr2/`, all
read): **all nine came back plain blue**, because reversing a north-south leg
gives you the other north-south bearing, not an eastern one.

**The lever is the sun's azimuth or an east-facing subject — not the hour, and
not the sky.** Corrected in `Shots.ts`'s own comment. The reversed batch also
returned a verdict on the landed shot: **keep it.** Its best frame (`RBh`) has
better landscape depth but no signboard, no cairn and no marker-stone line in
the near field, and does not beat it on the axis the batch was run to test.

This is the LANDMINES "diagnoses that were wrong" shape exactly: a real
observation (blue sky at 6.9), a plausible mechanism (the atmosphere ignores sun
elevation), and a control that was one capture away and would have killed it.

## The graveyard's skyline, MEASURED: the site is 990 m from Insomnia

The bearing trick failed and it was worth knowing why, so `tmp/l21/mega.mts`
stands at the graveyard camera `(3054.7, 41.1, −2391.6)` looking at bearing 60°
and lists every megastructure mesh within 12 km with its distance and its angle
off the look axis:

```
capital_mega_beacon   at(2436,-2654)  d=672m   143deg off-axis  y 327..766
capital_mega_pale     at(2362,-2743)  d=776m   147deg off-axis  y -40..150
capital_mega_cityLit  at(2350,-2744)  d=788m   147deg off-axis  y 156..636
capital_mega_lamp     at(2243,-2862)  d=938m   150deg off-axis  y 805..815
```

(The probe keeps the nearest instance per mesh name, so those angles are the
nearest *corner* of the city, not its extent — but the distances are the point.)

**The Adamantoise Graveyard's pin is 990 m from Insomnia** — (3100, −2350)
against (2560, −3180) — and the pin lane 18 moved it *from*, (2600, −2800), was
**382 m**. A `capital_mega_cityLit` slab 776 m away and 636 m tall subtends about
39° of elevation; there is no bearing on a 24-bearing ring that hides it, which
is exactly what the eight frames showed.

So this is not a framing problem, not a fog problem this lane can dodge, and not
a defect in lane 18's kit — which is good: the rib arches *do* read as pointed
arches and the carapace *does* read as a shell. It is a map decision. Filed in
`HUMAN_REVIEW.md` with these numbers.

## Corpus verification — the preview and the corpus AGREE this time

`shoot.mts threshold_stones northwatch_ruin --out tmp/shots/l21-lm`, both read.
Both corpus frames match their `framecam` previews closely, which is worth
recording because the predecessor's hard lesson was that they often do not.

- `northwatch_ruin` (384 draws) — a dark garrison silhouette: crenellated wall,
  barrel-vaulted hangar, two stilted watchtowers with orange lamps at the frame
  edges, a third behind the wall, lightning striking the mountain behind, rain
  streaks, misty ridges receding. **The best frame of this lane's two sessions.**
  Defect, lane 18's: four flat untextured cream lamp housings with no fixture
  behind them, and they are the highest value in the plate after the storm break.
- `threshold_stones` (not counted here; capture clean) — the felled milestone
  across the left foreground with chevrons incised down its flank, one stone at
  centre with three collar bands, four marching right over the ridge, a cliff and
  forested slopes far right, big cumulus, birds. **Defect, lane 18's: the shafts
  are flat untextured tan with no grain, no wear and no dirt at the foot, so at
  21 m they read as moulded clay rather than cut stone.** I disagree with lane
  18's "reads as cut by someone" — the *carving* landed, the *material* did not.
  Also in frame: four rock chunks floating in mid-air at the right, and a
  pale-grey placeholder post at bottom-centre-right.

## Residue for `project/TASKS.md` — ready to paste

Everything here was seen in a frame this session; the frame is named.

1. **`PoiKits._landmark`'s generic tail is one greybox used five times.**
   `washes_lookout`, `saxham`, `peak_overlook`, `saltgrass_flats` and
   `mencemoor_obelisks` all fall through to it. In frame the stele is a flat
   untextured beige box, the cairn is stacked grey cubes, and the five sites are
   indistinguishable. **Five corpus rows are waiting on this one material pass.**
   `tmp/shots/l21-arc/{WL_2,WL_5,SX_4,PK_6,SF_2,MO_10}.jpg`.
2. **The Threshold Stones' shafts have no material.** Carving landed (collar
   bands, chevrons); the surface is flat untextured tan with no grain, no wear
   and no dirt at the foot, so at 21 m they read as moulded clay.
   `tmp/shots/l21-lm/threshold_stones.jpg`.
3. **Northwatch Garrison's four lamp housings are flat untextured cream quads**
   with no fixture behind them, and are the highest value in the plate after the
   storm break. `tmp/shots/l21-lm/northwatch_ruin.jpg`.
4. **`pilgrims_rest`'s shop is a blockout**: a plain white-grey box, no door, no
   windows, and a **blank white sign board** on a post.
   `tmp/shots/l21-arc/PR_9.jpg`.
5. **`southwatch_haven`'s camp is a grey slab pad** — no fire, no tent, no read
   at 6–7% of frame height from any bearing. `tmp/shots/l21-arc/SW_3.jpg`.
6. **Star sprites render in front of near foreground geometry** — white points
   sit on the carapace shell metres from camera. `tmp/shots/l21-arc2/GN48b.jpg`,
   also on terrain in `GN48`/`GN66`. Stars are also large and visibly square.
7. **Floating detached geometry**, seen at five separate sites: rock chunks in
   mid-air at mesa height (`l21-lm/threshold_stones.jpg`, four of them, right of
   frame), a flat tan LOD slab in open air left of the Meteor
   (`l21-met/landmark_meteor.jpg`), rocks against the cliff
   (`l21-arc/MO_10.jpg`), a boulder over the ridge (`l21-arc/WL_5.jpg`), rock
   decals hovering off a gully wall (`l21-sr2/RCh.jpg`).
8. **A pale untextured parallelogram floats against the mountain** at Northwatch
   on two bearings — right edge in `l21-arc/NW_8.jpg`, near centre in
   `l21-arc2/NW48b.jpg`. Same defect class, relocated.
9. **Texture corruption on a `capital_mega` tower face** — a black-and-white
   checker/moiré block. `tmp/shots/l21-arc2/GY48b.jpg`, top-left.
10. **Cloud sprites have hard stippled/dithered rectangular fringes** and
    vertical comb/rake striping. Present in almost every day frame this session;
    clearest in `tmp/shots/l21-sr/south_road_dawn.jpg` and `l21-arc2/TH34.jpg`.
    At night they are flat hard-edged grey smears (`l21-arc2/GN34.jpg`).
11. **The location title card and the tutorial toast are baked into `framecam`
    captures** — "LONGWYTHE / LEIDE / KINGDOM OF LUCIS" and "THINGS YOU CAN USE".
    `tmp/shots/l21-arc2/{GY34,GY48,GY66}.jpg`, `l21-arc/{TH_6,TH_1}.jpg`. The
    predecessor filed the tutorial-card half; the title card is new. **Not in
    `shoot.mts` output** — both corpus captures this session are clean — so this
    is a `framecam` preview fault, not a corpus one.
12. **A placeholder pale-grey marker post stands inside the Threshold Stones
    site.** `tmp/shots/l21-lm/threshold_stones.jpg`, bottom centre-right.
