# Lane 17 — Spine, dungeons and wayfinding

**Quests.ts: RELEASED at ff695f8** — lanes 18, 19 and 22 may add rows. Both of
my `Quests.ts` edits (tasks 49 and 50) are in that one commit and I have no
further planned edit to that file. Released 2026-08-30, early in the lane.

Plan: `docs/plans/2026-08-30-fable-to-nine.md` Part D, items 49–56.
Owned: `src/game/`, `src/world/dungeons/`, `src/ui/screens/WorldMapScreen.ts`,
`src/tools/probes/mainchain.mts`.

## Status — all eight items closed

| # | task | state |
|---|---|---|
| 49 | un-soft-lock ch3 (`sword_wise`) | **landed** `ff695f8` · verified |
| 50 | stop ch1 self-completing | **landed** `ff695f8` · verified |
| 51 | the spine, with minutes | **measured negative: 46.3 min vs 50–65** `3187d78` |
| 52 | dungeon enemies | **landed** `427e68b` · verified |
| 53 | POI `gate:` removal | **landed** `1e2a1e4` · verified |
| 54 | spawn haven | **landed** `fe273b4` · verified by eye |
| 55 | map → autodrive | **landed** `7e355e3` · verified end-to-end |
| 56 | persist discovery fog | **landed** `1c3754b` · verified |
| — | `reachcheck` regression from 49/50 | **fixed** `8f75794` · 56/56 |

## Commits

- `ff695f8` ch3 un-soft-lock + ch1 re-author + `buy` objective kind + mainchain
  fetch-shim deletion
- `1e2a1e4` POI `gate` field removed (124 rows, zero consumers)
- `7807297` this handoff
- `427e68b` dungeons spawn their authored fights + combatloop dungeon round
- `fe273b4` spawn haven POI row (cross-lane one-liner into lane 18's file)
- `7e355e3` "Ignis, drive there" + regaliadrive section 5
- `1c3754b` SAVE_VERSION 4, fog + discovery persist, `probes/fogpersist.mts`
- `8f75794` reachcheck exercise walks chapter 1 deliberately
- `3187d78` `probes/spinetime.mts`

## Verified numbers

- `mainchain` **0 failures**, fetch shim DELETED, every main quest complete,
  story chapter 5, `main_ch1_pauper [1/1* 1/1* 1/1* 1/1*]`,
  `main_ch3_openworld [1/1* 8/8* 1/1*]`, sub-quest `hunt_sabertusks [12/12*]`.
- `combatloop` **35/35** (was 31/31): dungeon round green — 5 live MTs on
  entry, Magitek Commander arms on approach at 14 153 hp / 10.0 m off, dies to
  the real damage path with `encounter:kill` firing, 0 live outside, 5 on
  re-entry.
- `reachcheck` **56/56** (was 52/56).
- `integration` **26 pass · 0 wired-but-unproven · 1 not integrated**. The one
  failure is NOT mine: `walking up to a thing selects that thing — 1/65
  unreachable: gald_ferrybell->npc_navyth`, a Galdin interactable collision in
  lane 19's territory. Reported to the coordinator.
- `regaliadrive` all green including new section 5 (map-picked drive:
  0.85 km → 0.00 km in 90 s, 848 m → 0 m along the road).
- `fogpersist` 13/13.
- `spinetime` 46.3 guided minutes: ch1 14.0 · ch2 4.9 · ch3 17.2 · ch4 3.8 ·
  ch5 6.6 (17.7 min travel, 28.6 min acts).
- `grep -rn '\.gate\b' src` — only `check.mts`/`gatecache.mts`, which are the
  unrelated check-gate. Zero POI-gate consumers, before and after.

**Not taken:** no perf numbers. Eight lanes were capturing all night; per the
contract any perf number taken here would be worthless.

## What I looked at

- `tmp/shots/lane17-spawnhaven.jpg` — the party standing on the promoted spawn
  haven: fire lit, tent frames and the rune-marked flat present, and the
  `SAFE GROUND / HAVEN / LEIDE` arrival card up, which is the whole point of
  the task. (A party member clips into the rock: my probe teleported the player
  and snapped the party onto a raised flat, not a shipped defect.) The rock's
  own material reads very flat and untextured next to the ground around it —
  worth an eye, but it is `Ecology`/`Props`, not this lane.
- `tmp/shots/lane17/menu_world.jpg` — the chart with the detail card reading
  `ENTER FAST TRAVEL · I IGNIS, DRIVE THERE`, and the key legend gaining
  `I Drive`. Reads cleanly at the card's type size.

## Residue for `project/TASKS.md`

- **Chapters 2 and 4 are the short half of the spine.** Measured 4.9 and 3.8
  guided minutes against briefs of 8–11 and 8+ (`probes/spinetime.mts`). Both
  are three objectives of drive–talk–do with nothing between them; ch1 (14.0)
  and ch3 (17.2) are on target. Fixing it is content in `Quests.ts`, which this
  lane released to lanes 18/19/22 — whoever holds it next should add two or
  three acts to each, ideally routed through the new Galdin and Lestallum hubs.
- **The dungeon map screen is still unwired.** `DungeonMap` now draws enemy
  pips for fights that really exist, and nothing opens the screen.
- **`integration`: `gald_ferrybell->npc_navyth` unreachable** — a Galdin
  interactable collision, lane 19's area.
- **Three Keycatrich POIs share one road node**, so `roadGraph.route` between
  them returns length 0. `spinetime` floors the road distance at the straight
  line to work around it; the road graph itself still reports a 147 m leg as
  free, and anything else that prices a journey will believe it.
- **The haven rock's position is duplicated.** `Ecology._findFlat(-62,-46,40,9)`
  resolves to (-31.4, -20.3) and the new `spawn_haven` POI hard-codes (-31,-20).
  If that search ever moves, the pin does not. Same class of coupling the
  Hammerhead pin already carries a comment about.

Nothing for `HUMAN_REVIEW.md`.

## Cross-boundary edits I made, and why

- `src/world/map/WorldMap.ts` — twice, both plan-authorised: the `gate` field
  removal (task 53) and the `spawn_haven` row (task 54). Each its own commit
  with its own pathspec.
- `src/world/map/FogOfWar.ts` — added `toJSON`/`fromJSON` (additive, no
  behaviour change) because task 56 cannot persist the mask without them.
- `src/ui/Menus.ts` — one line, the world screen's key legend.
- `src/tools/check.mts` — one line, `combatloop` expectation 31/31 → 35/35.
- `src/tools/_reach/exercise.mts` — the reachcheck regression my task 50 caused.

## Files touched

`src/game/rpg/Quests.ts`, `Inventory.ts`, `RpgSystem.ts`, `SaveGame.ts`;
`src/game/encounters/EncounterDirector.ts`, `BossFight.ts`;
`src/world/dungeons/Dungeons.ts`, `Keycatrich.ts`, `kit/Layout.ts`;
`src/world/map/WorldMap.ts`, `FogOfWar.ts`;
`src/ui/screens/WorldMapScreen.ts`, `src/ui/Menus.ts`;
`src/tools/combatloop.mts`, `check.mts`, `_reach/exercise.mts`,
`probes/mainchain.mts`, `probes/regaliadrive.mts`, `probes/fogpersist.mts` (new),
`probes/spinetime.mts` (new).
