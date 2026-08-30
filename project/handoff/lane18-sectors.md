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
