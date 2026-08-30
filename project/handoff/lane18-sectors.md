# Lane 18 — Sectors and discovery

Plan: `docs/plans/2026-08-30-fable-to-nine.md`, Part D, tasks 57–65.
Owns `src/world/map/`, `src/game/encounters/SpawnTables.ts`, sector kits in
`src/world/props/PoiKits.ts`, new `src/game/rpg/Tombs.ts`.

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

**Two `roadcheck` rules made class-aware — same commit, and both make the gate
STRICTER.** Reported to the coordinator as a gate change.
- Rule 1 now measures to the nearest **drivable** road. `RoadGraph.nearest()` is
  class-agnostic, so a `parking` POI 20 m off a zero-speed footpath passed while
  being unreachable by any car. Harmless only while `trail` was unused.
- Rule 4 no longer demands a turning circle at a dead end whose every edge is
  zero-speed. The rule means *a car that drives here must be able to turn
  around*; the class-agnostic version would have forced tarmac at the end of a
  footpath and let the map screen repeat the lie.

**Task 63 — Tombs → royal arms — `06fc387`. LANDED AND VERIFIED.** New
`src/game/rpg/Tombs.ts` on the `Deposits.ts` register pattern, installed lazily
from `RpgSystem.update`'s first tick; new `royal-arm` AP rule (25 AP);
`PoiKits._tomb` now publishes a `sarcophagus` anchor and the prompt late-binds
onto it (late because `_make` runs at BUILD_R and the kit yaw is random, so at
install time there is no answer to where the coffin is). The table pairs on the
**NAME** — the ids are crossed on purpose and `install` throws if the map
disagrees.
**Verified**, `probes/tombclaim.mts`: 10 tombs registered, prompts offered
**10/10**, sarcophagus-anchored **10/10**, royal arms held **8/8**, missing
none, 8 × +25 AP and 2 × +5 AP, `pass: true`.

**Plaza paving — `f947649`** (coordinator hand-off from lane 19: *"the one thing
dragging every city frame down is the plaza — a flat, untextured plane in all of
them"*). New `pavingMaterial` in `PropMaterials.ts` (1.2 m flags, half-slab
course offset, per-slab jitter, joints in the normal and rougher than the slab)
plus a `worldUv` helper, applied to the `_town` plaza disc and the `_imperial`
landing pad. `M.concrete` itself is unchanged — it is correct as a wall/trim
role at building scale.
**NOT yet verified by eye** — see "Next step".

## Not done yet

- 57 south territories + `king_of_the_flats` set piece + `night_giant` widen.
- 58 NE territories (`graveyard_watch`, `peak_coeurls`).
- 59 N / 60 SE / 61 SW / 62 E+W+NW rows.
- Authored kit branches for `adamantoise_graveyard` (ribcage arches) and
  `threshold_stones` (leaning Solheim milestones) in `_landmark`.
- 64 `RegaliaSystem.nightDanger()` wiring.
- 65 micro-deposits, `old_book` weight, PLACES rows, Read plaques.
- Side quests `side_old_road` (Dave) and `side_the_graveyard` (Takka) —
  `Quests.ts` released by lane 17 at `ff695f8`.
- `drawcheck`, `perfpoi`, `reachcheck` after the content lands.

## Exact next step

`node src/tools/framecam.mts` with a candidates file (this tool applies
arbitrary shot objects to a live page, so a framing costs one frame rather than
a boot — it is how this lane looks at anything, since `Shots.ts` belongs to
lane 3/21). Frame the Lestallum plaza to check the paving, then the two new
landmark kits once they are authored.

## Framings requested from lane 21 (deliverable of this lane)

See "Shot framings for lane 21" at the bottom of this file.

## Open questions / cross-boundary

- `roadcheck.mts` is a shared tool. Both edits are documented in the file and in
  `67cf5d4`'s message.
- `Ascension.ts` gained one `AP_RULES` row (`royal-arm`). Additive.
- `RpgSystem.ts` gained the `tombs` field and two lines in `update`.
