# Lane 17 — Spine, dungeons and wayfinding

**Quests.ts: RELEASED at ff695f8** — lanes 18/19 may add rows.
(Both my `Quests.ts` edits, tasks 49 and 50, are in that commit. I have no
further planned edit to that file.)

Plan: `docs/plans/2026-08-30-fable-to-nine.md` Part D, items 49–56.
Owned: `src/game/`, `src/world/dungeons/`, `src/ui/screens/WorldMapScreen.ts`,
`src/tools/probes/mainchain.mts`.

## Status

| # | task | state |
|---|---|---|
| 49 | un-soft-lock ch3 (`sword_wise`) | **landed** `ff695f8`, verified by probe |
| 50 | stop ch1 self-completing | **landed** `ff695f8`, verified by probe |
| 51 | spine minutes | not started |
| 52 | dungeon enemies | code landed? — see below |
| 53 | POI `gate:` removal | **landed** `1e2a1e4`, verified by grep |
| 54 | spawn haven | not started |
| 55 | map → autodrive | not started |
| 56 | persist discovery fog | not started |

## 49 + 50 — `ff695f8`

`main_ch3_openworld` ended in `fetch sword_wise`, an item nothing in the game
grants (no shop stocks royal arms, no chest held it, no drop, no forage). Ch3
could never close, so ch4–5, six side quests, both set pieces and the only
royal arm were unreachable. Now `reach tomb_wise` (the quest's own reward hands
the blade over), and `sword_wise` is also seeded into Keycatrich's Imperial
Vault chest.

**The shim that hid it is deleted in the same commit**: `mainchain.mts`'s
`o.type === 'fetch'` arm handed the quest the very item it asked for. Replaced
with a loud `check(... false ...)` so a future main-line `fetch` fails.

`main_ch1_pauper` had three objectives of which the mid-game seed pre-satisfied
two (`hunt_killer_wasps` pre-complete; 42,180 gil against a `gil:1500` fetch).
Re-authored to four acts performed this session: ask Takka, take down the
Sabertusk pack (seeded accepted-and-incomplete), **buy a weapon**, tell Cindy.
The buy needed a new `buy` ObjectiveKind — event-only, so `Inventory.buy` emits
`item-bought` and `RpgSystem._wire` turns that into `quests.notify('buy', …)`.

**Verified:** `mainchain` with the fetch arm deleted — 0 failures, every main
quest complete, story chapter 5, `main_ch1_pauper [1/1* 1/1* 1/1* 1/1*]`,
`main_ch3_openworld [1/1* 8/8* 1/1*]`, sub-quest `hunt_sabertusks [12/12*]`,
`can buy iron_sword` ok.

## 53 — `1e2a1e4`

`PoiSpec.gate` on 124 rows (82 `null`, 5 `'ch4'`, 7 `'ch7'`, 8 `'menace'`, one
`'ch13'`, plus level/dungeon keys), **zero consumers**. Field removed from the
interface and every row; the declaration site carries the census and the rule
"gating gets a consumer FIRST". `grep -rn '\.gate\b' src` still shows only
`check.mts`/`gatecache.mts`, which are the unrelated check-gate. **Verified.**

## 52 — dungeon enemies (in progress)

New public `EncounterDirector.spawnAt(spec, pos, {interior:true})` +
`clearOwned(owner, pack)`; `EncounterDirector.interior` short-circuits `_stream`
so the wild generator does not roll dens against an interior's own world origin.
`BossFight.begin(at, standoff = 16)` — 16 m of stand-off is wrong in a 12 m room.
`Dungeons._armEncounters` on `_doEnter` (after `_patchTerrain`),
`_clearEncounters` on `_doLeave`, `_pollFights` arms bosses on room approach
rather than at the door (the boss slot is single and `begin()` fires
`encounter:boss` immediately).

Kind → species: `mt-squad`→`mt`, `mt-commander`→`magitek_armour`,
`goblin-pack`→`goblin`, `iron-giant`→`irongiant`, `sabertusk-pack`→`sabertusk`,
`mindflayer`→`necromancer`. There is no `mindflayer` and no `magitek_commander`
in `TYPES`; inventing two species to satisfy two markers was not worth it.

**Not yet verified in play.** Next step: `combatloop` dungeon round.

## Files touched

`src/game/rpg/Quests.ts`, `src/game/rpg/Inventory.ts`, `src/game/rpg/RpgSystem.ts`,
`src/world/dungeons/Keycatrich.ts`, `src/tools/probes/mainchain.mts`,
`src/world/map/WorldMap.ts`, `src/game/encounters/EncounterDirector.ts`,
`src/game/encounters/BossFight.ts`, `src/world/dungeons/Dungeons.ts`.
