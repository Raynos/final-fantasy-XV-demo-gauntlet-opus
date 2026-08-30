# Lane 18 — Sectors and discovery

Plan: `docs/plans/2026-08-30-fable-to-nine.md`, Part D, tasks 57–65.
Owns `src/world/map/`, `src/game/encounters/SpawnTables.ts`, sector kits in
`src/world/props/PoiKits.ts`, new `src/game/rpg/Tombs.ts`, new
`src/game/rpg/Plaques.ts`. **The rest of `src/game/encounters/` is lane 11's.**

## Landed and verified

**Roads and south/NE places — `67cf5d4`.** Route 20 (`track`, 2.9 km) from a new
`j_southroad` on the spine at (−40, 12) south to `n_kingsroad_end`; Route 21
(`trail`, 1.67 km — the class's first use anywhere) from `n_longwythe_peak` to
`n_peak_overlook` and `n_crag_haven`. Eight POIs: `threshold_stones`,
`southwatch_haven`, `saltgrass_flats`, `pilgrims_rest`, `old_kingsroad_end`,
`peak_overlook`, `crag_haven`, `adamantoise_graveyard`.
**Verified:** `roadcheck` 0 failures / 0 warnings — 41 drivable POIs 0
unreachable, worst grade 36.0% on the trail (limit 36%), tightest sustained
corner 70 m (limit 24), 19 dead ends 1 walk-in only, lowest road surface 6.9 m
(water −6.5), 0 sites under water, network 30.26 → **34.91 km**.

**Two `roadcheck` rules made class-aware** — same commit, both make the gate
STRICTER; reported to the coordinator as a gate change. Rule 1 measures to the
nearest *drivable* road; rule 4 no longer demands a turning circle at a dead end
whose every edge is zero-speed.

**Task 63 — Tombs → royal arms — `06fc387`. LANDED AND VERIFIED**
(`probes/tombclaim.mts`: 10 tombs registered, prompts 10/10, sarcophagus-anchored
10/10, royal arms held 8/8, 8 × +25 AP and 2 × +5 AP, `pass: true`).

**Tasks 59 / 60 / 61 / 62-E and the eleven territories — `0a61ed3`.** Route 9
extended 1.5 km to `n_northwatch`; `mencemoor_parking`, `mencemoor_obelisks`,
`moor_haven`, `northwatch_ruin`, `washes_lookout`, `saulhend_overlook`; eleven
`TERRITORIES` rows and the `king_of_the_flats` SET_PIECE; `night_giant`
widened 0.55 → 0.4. **Verified** by `roadcheck` in the same commit.

**Plaza paving — `f947649`** (coordinator hand-off from lane 19). New
`pavingMaterial` + `worldUv` on the `_town` plaza disc and the `_imperial`
landing pad. **NOT yet verified by eye** — see "Next step".

## Landed this session, NOT yet verified by eye

**`dcbd9d0` — the two authored `_landmark` branches.**
- `/graveyard/`: four rib arches walking away down a half-buried spine, a
  broken carapace (a **lathe**, not a sphere cap, so the fracture is a real
  section), 10 vertebrae, 16 shards, 9 boulders. New `bone` material.
- `/threshold/`: two gate stones leaning into each other, then five receding
  pairs, shorter/more tilted/likelier to be down as they go; kerb of set
  stones; rune faces on the gate cheeks.
- **First look (`tmp/shots/l18a`, HEAD `dcbd9d0`), read by eye:**
  - `th_s` / `th_w`: **the composition works** — a line of leaning obelisks
    marching over the ridge, a fallen one, the kerb reading as a vanished road.
    Backlit they are near-black; sunlit they are a good pale cream. **Defect:
    the stones are smooth featureless posts** — the taper and the pyramid cap
    barely read at 40 m, there is no carving, and every stone is the same value.
    They look like bollards, not Solheim.
  - `gy_n`: the ribs read as **two tall tapering spikes, not an arch**. `B/A` is
    19/8.4, so the ellipse is far too vertical and the crossing at the apex
    never reads. Needs A up and B down (nearer 1.4:1) before it is an arch.
  - `gy_e` / `gy_wide`: framings were bad (camera against the cliff the site
    sits under); re-derive from the built group's own yaw, which is what
    `tmp/lane18/probe2.mts` now does.

**`447a9ad` — the quests.** `hunt_king_of_the_flats` (rank 3, `longwythe`,
`setPiece: 'king_of_the_flats'`, reach-then-kill on the same waypoint, the
`hunt_bloodhorn` pattern); `side_old_road` (Dave, off `side_dog_tags`);
`side_the_graveyard` (Takka, off `side_meat_magnificent`). **Gated on the act,
never the conversation** per lane 17's warning: no `fetch_` anywhere in either
side quest (the one objective type a seeded inventory can pre-satisfy), and the
`talk` is last behind two reaches and a kill. **Not yet run through
`probes/questaudit.mts`.**

**`9d6b85e` — task 64, `nightDanger()` wired.** New
`RegaliaSystem._nightRoadDanger`: driving only, speed > 8 m/s, pressure > 0.5,
never during a capture, never within 90 m of a live fight; rolls
`daemon_pack` / `ronin_duel` through `EncounterDirector.spawnRoamer`
unmodified (lane 11's file is untouched) and fires `talk.react('nightfall')`.
**Not yet run through `probes/longplay.mts --night`.**

**`a44e0be` — task 65.** `Place` gained an optional `poi` and nine POI-anchored
PLACES rows, so a new landmark can finally fire its own area card (`site` rows
resolve to the FIRST Ecology site of a type and are generic by construction);
`Triggers.places()` resolves them and now memoises only once `Props` exists.
New `Plaques.ts` — three `Read` interactables (Saxham, the graveyard, the
threshold stones) on the `Tombs.ts` pattern, installed off the same lazy tick.
Two micro-deposits (`dep_washes` lightning 20/4, `dep_saltgrass` fire 22/4).
`old_book` listed twice in the `rock` forage pool. **None of it verified live.**

## Verified by eye this session

**The Threshold Stones — VERIFIED, ready to photograph.**
`tmp/shots/l18c/th_obl.jpg` — the carved second pass, `d6a0353`; the threshold
branch is unchanged since: a monumental
gate stone with the collar and the three incised bands clearly legible at
twenty-five metres, a felled stone lying with its foot still in its socket, the
receding pairs behind it, the kerb reading as a vanished road. It reads as cut
by someone. The one caveat is that from the south the whole alignment is
backlit and the stones go nearly black — sun angle, not the kit.

**The plaza paving — VERIFIED, lane 19's complaint is answered.** At two metres
(`tmp/shots/l18c/plaza_down.jpg`) it is real 1.2 m flags with a half-slab
course offset, a per-slab value jitter and joints in the normal. At fifteen
(`plaza_high.jpg`) the square reads as laid ground rather than as a flat
untextured plane. The disc's *edge* was the remaining defect — a bare 0.35 m
cylinder wall with the ground stopping dead against it — and is fixed in
`ea23699` by battering the disc into a shallow plinth (same walking surface,
same `PLAZA_Y`, 40 segments instead of 22).

**FOR THE COORDINATOR / whoever owns city NPC placement:** in
`tmp/shots/l18c/plaza_down.jpg` the Lestallum townspeople are **sunk about 20 cm
into the plaza deck** — every one of them is cut off mid-shin. `PLAZA_Y` is
0.675 and published for exactly this; someone is placing on the terrain height
instead. Five of lane 21's judged frames are city frames.

## The graveyard: third pass VERIFIED BY EYE — ready to photograph

`tmp/shots/l18d/gv_axis.jpg` and `gv_shell.jpg`, read at `5a2bac6`:

- **The arches read.** Four rib arches marching away across an open pan, each
  smaller than the last, the pair on each one crossing at the apex so it is a
  pointed arch and not two tusks. The 1.42:1 ellipse was the fix.
- **The carapace reads** — a domed shell with its radial scute ridges, tipped on
  its edge and sunk to its rim, with an arch standing beside it for scale.
- **Bone is bone now**, not polystyrene: warm off-white in the sun, dirty at the
  earth line.
- The vertebrae went slightly too far the other way — they read as scattered
  bone fins in the grass rather than as a spine. Acceptable; a successor
  wanting a beat here should raise `sc` back toward 1.8 and tighten the spacing
  from 6.2 m to about 4.5.

**Open, and it needs a call rather than an edit.** Both the old site and the new
one look out on the Insomnia megastructure skyline — the tall slabs in the
background of `gv_axis.jpg` are `Megastructures.ts`, not this kit, and they were
equally present at (2600, −2800) in `l18c/gv_axis.jpg`. So the move did **not**
introduce them. But "the empty quarter, farthest from everything" now has a
dead city on its horizon, and whether that is the right meaning for the bone
country is a composition decision above this lane.

## How the third pass got there

`5a2bac6` moved the POI and rebuilt three things after reading
`tmp/shots/l18c/gv_axis.jpg`, where the first pass showed (a) half the cage
buried in a hillside with the far arches cut off by a ridge, (b) eleven neural
fins reading as a row of **white tower blocks** — they were chamfered boxes,
which is this kit's *building* primitive — and (c) ribs reading as lengths of
white pipe.

- **Site moved (2600,−2800) → (3100,−2350), measured.** `tmp/lane18/flat.mts`
  samples 24 points on two rings and reports the worst height deviation inside
  110 m: **57.6 m** at the old pin (mean 12.6), **10.1 m** at the new one (mean
  3.5). It is the flattest ground within 700 m that is still 1.6 km out from
  Ravenscrag Haven. Nothing else within 900 m; the territory, the quest
  waypoint and the PLACES row all anchor on the POI and move with it.
- Fin is now a four-sided taper to a blade, half the height, and the vertebra
  is sunk to a third rather than stood on the ground.
- Each rib drum is squashed to 0.55 across the arc's own plane (the `rz` that
  follows turns it *inside* that plane, so the squash stays perpendicular to
  the sweep) plus per-segment jitter.
- `bone` 0xd9d2c0 → 0xc6bba0, roughness 0.84 → 0.88, grime 0.44, streak 0.42.
  At the old value the bleach put the top of an arch within a few per cent of
  white and the whole thing read as painted polystyrene.

**`questaudit` came back GREEN: `--- 0 unsatisfiable objectives ---`** across the
whole table, and every objective of the three new contracts resolves --
`side_the_graveyard`'s `kill/coeurl`, `reach/adamantoise_graveyard` and
`talk/takka` are all `ok`, and `graveyard_watch` reports at (3220, −2440), which
is the moved pin plus its `near()` offset, so the territory travelled with the
POI as intended.

**`perfpoi` came back GREEN** (`tmp/lane18/perfpoi.json`): **129 sites built,
`over33: 0`**, median 8.7 ms, worst 27.9 ms at `coernix_alstor` (an `outpost`,
and not this lane's). The row that matters here is **`landmark`: n 30, median
1.9 ms, max 11.7 ms** — the two authored branches are inside it and the whole
type is a third of the 33 ms budget, so the ribcage and the alignment cost
nothing anyone will feel. `over16: 8`, all of them aprons on havens and
outposts.

Practical note for the next agent: **redirect a probe's stdout to a file.** The
background-task buffer keeps roughly the last thirty lines and this report is
two hundred, so the first capture of it lost every row above `menace`.

**`drawcheck` came back VOID — a harness fault, and against a stale sha.** It
queued for **1803 s**, ran 49 s, captured 16 of its 47 shots and then aborted on
batch 2 with *"daemon socket idle for 2700 s -- this is the harness, not the
game."* It was also capturing `sha:36a2ba52d2b4`, which is where HEAD stood when
it was **queued**, an hour and eight commits before the tree it was meant to
measure. So it is not evidence either way about this lane's kits. **Re-run it,
and check `daemon.mts --health` and `cleanup.mts` first.** Frames it did take
are in the cache, so the re-run is cheaper than the first.

**The re-shoot came back and is read above.** `drawcheck --worst 30`, `probe
src/tools/probes/perfpoi.mts` and `probe src/tools/probes/questaudit.mts` did
**not** — they were still queued at hand-off behind an exclusive lease that
freed after 288 s and was immediately retaken, with 25 jobs in the queue across
`fix` and `sweep`. `harnessstats`: **60% of all harness time tonight was
queue.** Not a fault in these jobs. **Re-run those three first thing.** Note the
probe path must be `src/tools/probes/<x>.mts`, not `probes/<x>.mts`.

## Not done yet

- **Fix the two landmark kits from the frames** (see the defects above) — this
  is the top of the queue; lane 21 is waiting to photograph both.
- Verify the plaza paving by eye.
- `probes/questaudit.mts`, `probes/longplay.mts --night`.
- `drawcheck`, `perfpoi`, `reachcheck` (`must-run.json` may want the two new
  landmarks and the plaques).
- POI count is ~137 now; the prose "124" in `PoiKits.ts` and elsewhere is stale
  and wants one sweep.

## Exact next step

`node src/tools/framecam.mts --out tmp/shots/l18c --jpeg --probe
tmp/lane18/probe2.mts` — the probe flies to each site, reads the built group's
own position and yaw, and derives four framings per landmark plus three plaza
framings **in the site's own local frame**, which is the only way to frame a
kit whose yaw is seeded. Read the frames, then widen the rib ellipse and carve
the milestones.

## FOR LANE 11

Nothing needed. `_nightRoadDanger` calls `EncounterDirector.spawnRoamer(def)`
and reads `suppressRoamers` / `boss` / `enemies.countNear` — all existing
public surface, no edit to your file. If you change `spawnRoamer`'s signature
or make roamers refuse to spawn while the player is in a vehicle, tell me.

## Open questions / cross-boundary

- `roadcheck.mts` is a shared tool; both edits documented in `67cf5d4`.
- `Ascension.ts` gained one `AP_RULES` row (`royal-arm`). Additive.
- `RpgSystem.ts` gained `plaques` (three lines) beside `tombs`.
- `Triggers.ts` / `Chapters.ts`: `Place.poi` is additive; the memo guard is a
  strict improvement to a latent bug.
- `Foraging.ts`, `Elemancy.ts`: one row each, additive.
