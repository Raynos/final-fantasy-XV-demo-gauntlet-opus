# Lane 17 — Spine, dungeons, wayfinding (cold-start brief)

Owns: `src/game/` (rpg, encounters, story), `src/world/dungeons/`,
`src/ui/screens/WorldMapScreen.ts`, `src/tools/probes/mainchain.mts`.
**NOT yours:** `SpawnTables.ts` + `WorldMap.ts` POI rows (lanes 18/19) —
those land as explicit-pathspec one-liners. `Quests.ts` is yours FIRST;
lanes 18/19 queue behind you.

## Anchors per task

**49 · un-soft-lock ch3**
- `Quests.ts:330` `fetch_('sword','sword_wise',1,…,at('tomb_wise'))` —
  nothing grants it (`Inventory.ts:286` defines; no shop `Inventory.ts:
  840-858`; no drop). Rewrite as `reach('sword','tomb_wise','Claim the
  Sword of the Wise', at('tomb_wise'), 18)` — the quest's own reward
  already hands the item (`Quests.ts:332`), so `reach` alone breaks the
  lock with no dependency on lane 18's Tombs.ts.
- POI exists: `WorldMap.ts:451` tomb_wise (66,−1514) lv12 r60.
- Chest seed: `Keycatrich.ts:109` Imperial Vault — append `'sword_wise'`.
- **Shim to delete, same commit**: `mainchain.mts:71-73` — the
  `o.type === 'fetch'` branch grants the item to itself. After task 50 the
  gil fetch is gone too, so the whole fetch branch goes; any surviving
  fetch must fail loudly.

**50 · re-author main_ch1_pauper** — `Quests.ts:299-308`.
- Self-completion source: `RpgSystem.ts:148` STARTER_QUESTS.complete =
  ['main_ch1_departure','hunt_killer_wasps'] + seeded 42 180 gil;
  `QuestLog.settle` (:963-985) closes it on accept.
- New acts: `{id:'bounty', type:'quest', target:'hunt_sabertusks',
  count:1}` (live-but-incomplete in the seed); `talk('cindy',…)` (fires via
  Npcs.ts:486 generic notify); a new `buy` objective.
- `'buy'` plumbing: add to ObjectiveKind (:180-182); `Inventory.buy` is
  `Inventory.ts:779-789` — emit after spendGil (:787) and add one line in
  `RpgSystem._wire` next to the item-gained listener (:335-336):
  `this.quests.notify('buy', { target: def.category === 'weapon' ?
  'weapon' : id })`. Hammerhead stocks iron_sword/bronze_spear/handgun/
  buckler (Inventory.ts:843).
- main_ch1_departure already owns `talk cindy` — use different verb copy.

**52 · dungeon enemies**
- Author rows (6, 3 bosses): `Keycatrich.ts:117-118` (mt-squad ×5,
  mt-commander boss), `Balouve.ts:118-119` (goblin-pack ×4, iron-giant
  boss), `Fociaugh.ts:108-109` (sabertusk-pack ×3, mindflayer boss).
  Shape: `EncounterSpec` Layout.ts:283-291 `{at:[x,z], r, kind, count?,
  boss?, name?}`; `Layout.encounter()` :514-518 (rewrite its "spawn
  nothing" doc). Only consumer today: DungeonMap.ts:111.
- Wrapper: new public `EncounterDirector.spawnAt(spec, pos,
  {interior:true})` — copy the pack-spawn body of activate() (:236-273)
  (`new Pack(...)`, `this.enemies.spawn(key, {pos, level, pack, leash,
  owner})`, `this.packs.push(pack)`) but SKIP `this.active.set()` so
  `_streamOne` (:970-996) never distance-deactivates/respawns it.
- Bosses: build a SetPiece LITERAL in spawnAt and hand to
  `new BossFight(def, this)` + `fight.begin(pos)` — do NOT add SET_PIECES
  rows (lane 18's file). Mirror `HuntRuntime.armSetPiece:80-98`.
  `BossFight.begin` (:76-110) stands the boss 16 m off the party.
- **Species keys** (Bestiary.ts:121-143): there is NO `mindflayer` and NO
  `magitek_commander` — map mt-commander → `magitek_armour` (kind
  'imperial', dropship:false) and mindflayer → `necromancer` or
  `bussemand`.
- Call site: `Dungeons._doEnter` (:375-437), after `_patchTerrain()`
  (:408) and party placement (:411-424), before `state='inside'` (:433).
  World pos = `d.origin + [at[0], floorAt, at[1]]` (Dungeon.ts:279-294).
  Track spawned ids on the Dungeon record; clear in `_doLeave`
  (:439-476), respawn next enter() — "no respawn per visit" for free.

**53 · POI gate:** declared WorldMap.ts:353, doc :329, ~124 rows carry it,
**zero readers** (other `gate` hits: HuntBoardScreen.ts:48 unrelated,
Grazer.ts:79-82). Delete or comment inert; verify grep after.

**54 · haven rock** — `Ecology.ts:589-590` decorative haven at (−62,−46).
Promote with ONE POIS row near WorldMap.ts:395: `{ id:'spawn_haven',
type:'haven', zone:'longwythe', x:-62, z:-46, r:55, travel:true, lv:1,
… }`. HAVENS derives automatically (DayCycle.ts:86-96, level-sorted) and
`HAVENS[0].discovered = true` (:96) — **lv 1 moves the pre-discovered flag
off Cotisse, intended; say so in the commit.** HAVEN_RADIUS 14;
HavenCamp.ts:50 iterates. POI row = lane 18's file → explicit pathspec.

**55 · map → autodrive** — `WorldMapScreen.accept()` :372-384 is fast
travel; `Menus.ts:489` binds Enter/Space/pad-A. Add a second key in
`WorldMapScreen._onKey` (:402-407) — e.g. KeyI → **use
`RegaliaSystem.driveTo` (`RegaliaSystem.ts:348-352`), NOT setTargetPos
directly** — it wraps setTargetPos (AutoDrive.ts:68-71, road.nearest),
flips setAutoDrive(true), calls enter(true) if on foot. Gate on
`p.travel || POI_TYPES[p.type].drive` and `map.discovered.has(p.id)`;
close with `menus.setScreen(null)`. Prompt copy in `this.cardFt` (:250).

**56 · fog persist** — ctor reseed `WorldMap.ts:932`; only runtime writer
`Minimap.ts:170` → `discoverAround` (WorldMap.ts:1124-1136). Add
`map?: { discovered: string[] }` to SaveData (SaveGame.ts:41-58), write in
serialize (:150-176), restore in RpgSystem.loadGame (:740-750), bump
SAVE_VERSION (SaveGame.ts:18) → 4 with MIGRATIONS[3] beside :119-128:
`(data) => ({ ...data, version: 4, map: data.map ?? { discovered:
['hammerhead','hammerhead_layby'] } })`. Never edit an old migration.

**Chapter sanity** — Chapters.ts:38-56; scenes key off
`objective:main_ch1_departure:push` and `quest:main_ch1_pauper:accepted`
(also StorySystem.ts:325). `_advanceChapterLine` :164-173;
`completeChapter` :178-190. Re-authoring objectives touches neither key —
but do NOT rename the quest id; keep Hammerhead.ts:176 auto-accept.

## Mechanism notes
- `QuestLog.notify(type,{target,count})` (:1032-1074): objectives complete
  IN ORDER (:1053 blocks on earlier undone); matching is exact or
  `target:`-prefixed. `settle()` covers fetch/quest only — a `buy`
  objective is event-only, the notify is mandatory.
- `at(poiId)` THROWS at load on unknown ids — a typo is a boot failure.
  Never reference `spawn_haven` from Quests.ts before the row lands.
- `Dungeons._patchTerrain` (:538-548) redirects heightAt to the interior
  floor, so `EncounterDirector.ground()` (:195-199) already returns
  dungeon floors — call spawnAt only after _patchTerrain().
- `_hideExterior` (:495-520) keeps Enemies in KEEP_SYSTEMS — spawns stay
  visible inside.
- `EncounterDirector.update` keeps running inside: set `suppressRoamers`
  on enter and short-circuit `_stream` with an interior flag.
- `Dungeon.floorAt` returns null outside the carved volume — guard.

## Commands
```
node src/tools/probe.mts src/tools/probes/mainchain.mts     # exit for 49/50
node src/tools/probe.mts src/tools/probes/questchain.mts
node src/tools/probe.mts src/tools/probes/questaudit.mts
node src/tools/combatloop.mts                               # add a dungeon round (52 exit)
node src/tools/probe.mts src/tools/probes/slice.mts
pnpm run check
```

## First commits
1. Quests.ts:330 fetch→reach + mainchain fetch-branch deletion — ONE
   commit; mainchain is the proof.
2. Keycatrich.ts:109 chest seed.
3. ch1 re-author + ObjectiveKind 'buy' + Inventory.ts:787 emit +
   RpgSystem.ts:336 notify.
4. EncounterDirector.spawnAt alone (no callers) — commit, then wire
   Dungeons._doEnter.
5. gate: removal; spawn-haven POI row (separate pathspec).
6. WorldMapScreen drive-there; SAVE_VERSION 4 + fog persist LAST (touches
   the migration chain).

## Landmines
- Explicit pathspec only (shared index; hook blocks -am/-A/bare).
- Don't add SET_PIECES rows for dungeon bosses — literal in the director.
- SAVE_VERSION bump without MIGRATIONS[3] silently stamps old saves
  (migrate :137-142 falls through).
- A lv-1 spawn haven silently steals HAVENS[0].discovered — intended,
  state it.
- BossFight sets dir.boss; two armed at once clobber (startSetPiece:397
  ends the previous). One boss per room trigger.
- `_streamOne` deactivates anything in `this.active` 230 m away — interior
  origin can be km from the entrance. Keep interior packs OUT of active.
- mainchain also self-drives talk/reach via raw notify — fine (real world
  drivers exist); only the fetch branch lies.

## Done-when
mainchain reaches ch5 with the fetch branch DELETED, all main quests
complete, chapter ≥5; questchain shows ch1_pauper active-not-complete at
boot, ticking off a real hunt + real Cindy talk + real buy; combatloop
gains a dungeon round (Keycatrich MT patrol + commander via BossFight, no
respawn within visit, gone after leave, back on re-entry);
`grep -rn "\.gate" src` zero consumers; spawn haven in rpg.tables.havens,
campable, pre-discovered HAVENS[0]; map-picked Ignis drive arrives
end-to-end; save/reload keeps fog, v3 save loads clean.
