# content-wire — phase 4, the quest chain

Owner: quest-chain agent, worktree `agent-a430ca1362dc1cf7e`, `PORT=5410`.
Contract: `docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md`.
Predecessors in this lane: `agent-a7340f8d11756a846` (WS-4/WS-5, the opening
slice) and `agent-af853a3898f7c38cd` (WS-0/WS-1). **Everything they merged is
still true and still passing** — do not re-audit whether the RPG layer is
orphaned, whether the E key works, or whether the pre-8 km coordinate tables
were fixed. They were.

`npm run check`: **11/11 green** on a quiet tree. `integration` **26**,
`combatloop` 31/31, `uxcheck` 89/89, `anycheck` 0.

---

## 1. The headline

**The story now runs from chapter 1 to the end of chapter 5.** This morning it
stopped at chapter 2's second objective, and would have stopped again at
chapter 3's third, and both were hard stops that no gate was watching.

`node src/tools/probe.mts src/tools/probes/mainchain.mts`:

```
main_ch1_pauper    complete   ch1 done -> story on chapter 2
main_ch2_galdin    complete   ch2 done -> chapter 3
main_ch3_openworld complete
main_ch3_deadeye   complete   ch3 done -> chapter 4
main_ch4_lestallum complete   ch4 done -> chapter 5
main_ch5_titan     complete
```

**`questaudit`: 21 unsatisfiable objectives -> 0.** That is the number the
brief handed me and it is the number that is gone. It was reported as 23; the
truth was 21 when I measured it, and six of *those* were false — see §5.

## 2. The scoreboard against the brief

| the brief said | what happened |
|---|---|
| 5 missing NPCs | **built.** Dino, Iris, Wiz, Holly, Randolph — cast, dialogue, placement, measured ground |
| 6 objectives on verbs nothing notifies | **4 wired** (`photo`), **2 cut** (`escort`, `fish`) with the objectives rewritten |
| 3 items with no source | **sourced.** `sky_gemstone`, `old_book`, `imperial_relay` |
| 1 species that never spawns | **staged.** `deadeye` is a set piece |
| the rank curve is undesigned | **designed, and it was unclimbable** — §4 |
| coordinator: chapter 3 cannot close | fixed, plus two more chapter-advance defects it was hiding |
| coordinator: no dungeon can be entered | fixed; all three enterable, chests paying out |
| coordinator: the boss set-piece path is dead | all four staged fights now run |
| coordinator: elemancy has no in-game door | **not done.** §7 |
| judge: prompts fire over empty landscape | fixed, reproduced and re-verified by capture |

## 3. What a player can do now that they could not this morning

- **Walk into a dungeon.** Three interiors were built at boot and had no door.
  The old wiring called `Interaction.add`; the method is `register`. All three
  enterable, their chests pay 420 / 380 / 260 gil, and the exit works.
- **Finish the main story.** Five people the quest table names did not exist,
  a chapter-3 boss was in no spawn table, and `completeChapter` opened the next
  chapter only if the cinematic letterbox happened to exist.
- **Fight the four staged bosses.** `BossFight` and `TitanArena` had never
  executed in play *or* in the harness.
- **Climb the hunter ladder.** Ten of twelve bounties were behind gates the
  board could not pay for.
- **Take a photograph that counts.** Four objectives, one of them chapter 4's
  last, keyed off an event nothing posted.
- **Talk to somebody who is actually standing there.**

## 4. The rank curve, since the brief asked for the design

**The old one could not be climbed, and it is arithmetic, not taste.** Rank-2
bounties wanted 5 points; a rank-1 hunt pays 1; the board had two rank-1 hunts.
Ceiling: 2 points. `Legend` at 120 was past the 84 the whole board could pay.
The gate table lived in `HuntBoardScreen` and the payout table in `Quests.ts`
and nobody had held them up against each other.

The ladder is now **derived from what the board actually pays**, in order:

```
 0  Unranked              1  Apprentice  -> rank 2   Bronze Bangle
 4  Trapper   -> rank 3  10  Chaser      -> rank 4   Topaz Bracelet
21  Ranger    -> rank 5  40  Warrior     -> rank 6   Champion's Anklet
82  Legend    -> rank 10                             Ribbon
```

Three properties it was designed for:

- **Every rung lands exactly on a hunt completion**, with about one contract of
  slack, so no rung needs a clean sweep of its band.
- **The first rung is at 1 point.** The *second* bounty a player takes visibly
  grows the board. A ladder you cannot see moving in the first ten minutes is a
  wall, and this is the single thing that makes the 30-minute slice feel like
  progression rather than a list.
- **The rung you see is the unlock.** `RANK_GATE` is derived from `HUNTER_RANKS`
  rather than written twice, and the board says "Trapper opens ★★★ contracts"
  instead of just naming the rung.

It also **pays out now**. Every rung carried a `reward` string that the board
printed and nothing ever granted — the fight → reward → spend → fight better
loop stopping one step short of closing. `RpgSystem._checkHunterRank` grants the
accessory once per rung and records the rung a loaded save is already on, so an
old save is not paid twice and the first hunt of a session is not swallowed.

Two new bounties fill the band gaps and light the two dead `BossFight` kinds:
`hunt_bloodhorn` (rank 3, Saxham, field) and `hunt_magitek_armour` (rank 5,
Norduscaen, imperial). Fourteen bounties now, all reachable.

`node src/tools/probe.mts src/tools/probes/rankcurve.mts` walks the whole board
from a fresh save and prints the climb.

## 5. What I wired, what I cut, and why

**`photo` — wired.** The screen was already finished; it just never told
anybody. `PhotoScreen.accept()` classifies the frame and notifies each subject:
`meteor` (within 4.2 km of the Disc, pointed within ~40°), `beast` (alive,
inside 90 m, inside the lens cone), `party`, `vista`. Generous on angle and mean
on distance, deliberately.

The `party` rule is worth knowing: the first attempt tested whether the
companions were *in front of the lens* and could never tick, because they
follow the player and are permanently behind a shoulder camera. "All four of you
at camp" is a camp photo, so the test is `canCamp()` — the same one the bedroll
prompt uses — plus the party gathered. That also stops it being satisfiable by
every photograph ever taken, which a bare distance test would have been.

**`escort` — cut.** An escort is a follower with pathing, a leash, a fail state
and a death check. None exists, and half of it is a chocobo that walks into a
rock and fails the quest. `side_chocobo` is `talk → reach the paddocks → talk`:
the same beat in verbs the game has. The type stays in `ObjectiveKind` because
`Objective.failable` describes it and a follower system will want it back.

**`fish` — cut.** There is no fishing in this game: no rod, no line, no cast, no
minigame. A `fish` objective that ticks off a keypress is not fishing.
`side_legendary_fish` is now about the voretooth pack on the Alstor shore, which
is a better explanation for eleven years of no trout than bad luck. **Fishing is
the highest-value thing left on the content list** — see §7.

**The audit was lying about six objectives.** `questaudit` compared every `kill`
target against the bestiary, so the six hunts credited through `creditMark`
(`hunt_naga` spawns an `arachne`; `hunt_zu` a renamed bandersnatch) came back as
dead every run. Six false failures is enough noise to hide a real one, which is
the one thing an audit must not do. It asks `HUNT_TARGETS` and `SET_PIECES`
first now.

## 6. The gate work, and the ablation that proves it

`integration` gained **three** checks. All three exist because something was
green while the thing it names was broken.

- **`the main line runs from chapter 1 to the end`** — the gate the last handoff
  asked for. Drives all seven main quests through the real notify path.
- **`every quest objective has a source in the world`** — `questaudit` folded in,
  and it is separate on purpose. The chain check satisfies objectives by calling
  `notify` directly, and `notify('talk', 'dino')` ticks whether or not a Dino
  exists. **Ablated to prove it:** comment Dino out of `Npcs.REMOTE` and you get
  `FAIL ... main_ch2_galdin:talk/dino never placed` from this one and `PASS` from
  the other. That split is exactly the defect that shipped here for months.
- **`no prompt is offered where its subject is not`** — §8.

Three existing checks were **passing on lies** and are fixed:

- `interaction verb finds targets` teleported the player with a bare
  `position.set` and no hold, so the controller put the party back and it
  reported whatever was near their *real* position. That is how "standing at the
  board" reported `selects "Cindy Aurum"` as a pass. It holds the position, uses
  the town pad height rather than raw terrain three metres below it, and
  requires the thing selected to be the board.
- `walking up to a thing selects that thing` counted deliberately-disabled
  interactables as misses.
- `questaudit`'s six false failures, above.

## 7. What is still broken, ranked

### 7.1 Fishing is the biggest content gap left, and the shape is known

Eight `type: 'fishing'` POIs already exist in `WorldMap`. Registering a `Fish`
interactable at each — cast, a short wait, a small catch table, `inventory.add`,
`notify('fish')` — would be **the world's only non-combat verb**, would make
eight authored places do something, and would feed the cooking loop with
ingredients. It is maybe 80 lines plus a home: the blocker is that `Game.ts` is
the coordinator's, so a new system cannot register itself. The honest homes are
`InteractionSystem.init` (it already owns world verbs) or an existing system's
init. Decide that first.

### 7.2 The dungeon doors are 1.2–2.8 km from their own map pins

Now that dungeons can be entered, this is visible. All three entrances carry
literal coordinates written against the old 3 km world:

```
keycatrich  pin (110, -1460)   door (-113, -229)   1,251 m apart
balouve     pin (2784, 1146)   door (294, -232)    2,846 m apart
fociaugh    pin (-1720, -1420) door (110, 356)     2,550 m apart
```

`main_ch3_openworld` sends the player to `at('keycatrich_trench')` and the door
is 1.25 km away. `probes/dungeondoor.mts` prints the measurement every run.
**Reported, not touched:** `src/world/dungeons/` geometry was the modeling
lane's tonight, and moving an entrance re-grades terrain. This is the same
class as the Hammerhead pin the previous lane fixed, and it wants the same
treatment: authored coordinates that resolve through `WorldMap`.

### 7.3 A live staged fight cannot be photographed

`framecam` applies its shots after the probe returns, and `applyShot` runs a
Director scenario that clears the encounter — so every attempt to capture a
*live* set piece comes back as empty grass with the boss despawned, frozen or
not. The corpus's `boss_field` / `boss_imperial` / `boss_astral` shots dodge
this because `Director._bossScenario` spawns and freezes the enemy directly,
which is precisely why they have never exercised `BossFight`. Looking at one
needs a shot scenario that routes through `startSetPiece`, and that is
`Shots.ts` (the coordinator's) and `Director.ts`. `probes/stagecam.mts` is kept
because it is three lines from working the moment such a scenario exists.

Behaviour is proven meanwhile by `probes/setpiece.mts` (right species, right
HP, at the marker, 0 failures), and Deadeye's *appearance* is the Bandersnatch's
— it is `variant(BANDERSNATCH, …)` — which is already-reviewed art.

### 7.4 Elemancy still has no in-game door

`RpgSystem.craftSpell` is called only from `combatloop.mts`. `side_elemancy_lesson`
passes the audit because `draw` and `craft` both have notifiers, but there is no
*screen* that reaches crafting, so in practice the player cannot do it. This was
on my list and I did not get to it. It is a UI job — `src/ui/` — and the
Elemancy model underneath is complete.

### 7.5 The dead code the inventory agent flagged, re-checked

`CameraRig.setLockOn`, `BossFight.resolveStrike`, `slamAt` and `_handPos` are
**still dead**, and now that `BossFight` actually instantiates, `resolveStrike`
is the one that matters: `Enemies.onStrike` routes to
`EncounterDirector.resolveStrike`, an arc sweep off the enemy root, so Titan's
forty-metre fist still does not land where the hand is. That is now a *visible*
defect rather than a theoretical one, because the Titan fight is reachable.

### 7.6 Carried forward, still true

- `hammerheadPan` still flattens desert at (60, 40) with the town at (576, 10).
  Moving a landform re-bakes terrain under other lanes. **Leave it.**
- `hunt_zu` spawns a renamed bandersnatch, so killing the Zu also completes
  `hunt_bandersnatch` through the ordinary species notify. Both are rank 6+.
  The honest fix is a Zu in the bestiary — which would also give `sky_gemstone`
  a better home than the Mesmenir.
- Four waypoints sit on ground steeper than 0.42, all because the *place* is
  steep. `probes/dens.mts` prints them.
- The haven pad reads as concrete rather than FFXV's rune-cut rock shelf.

## 8. Traps this cost real time to find

- **A prompt anchor that is never written is a prompt over empty desert.**
  `Npcs._registerTalk` handed every person an empty `Vector3` and `update` only
  wrote it inside 85 m, so from the breakdown all four Hammerhead anchors read
  (0, 0, 0) — and the game starts at (0, 0). A blind judge ranked the resulting
  `TALK / TAKKA` over open ground **2nd of eight defects in the corpus**.
  Reproduced with `probes/phantom.mts` against the pre-fix tree, fixed two ways
  (seeded at registration, refreshed for every NPC every frame regardless of
  LOD), and re-verified by capturing `shoot.mts storm`, where it is gone.
- **A town POI is one merged volume.** The whole of Lestallum is a single 140 m
  box, so any offset that reads as "in the market square" puts a person under a
  roof. `CollisionWorld` does not carry those buildings, and where it does,
  `blocked()` returns false inside a room — because the inside of a room *is*
  clear standing room. The test has to be "is there geometry over this spot".
  `probes/standingroom.mts` does it against the scene graph. Its answer for both
  towns was "68 m out, in a field", so all three moved to the **`parking` POI**:
  a paved apron by construction, where fast travel lands, and where you would
  actually meet somebody.
- **`look.idle` and the placement `posture` compose.** They are both additive
  bone biases. Randolph was authored with crossed arms in the idle *and* a
  `counter` posture and came out as a scarecrow. The convention the existing
  eight follow, which nobody had written down: the idle carries the spine, hips
  and stance, and the posture owns the arms. `probes/poses.mts` reads the bones.
- **`g.get('Director')` is the play director.** The boss lives on
  `g.get('Encounters')`. Reading `dir.boss` gives null forever and looks exactly
  like the fight failing to start.
- **`enemy.id` is the instance number.** `speciesId` is what the quest log
  matches kill objectives against.
- **A probe is a function body in the page**, so `import('three')` throws and
  `/node_modules/...` is outside vite's root. Use methods that already live on
  the objects in the scene (`clone()` off a live vector, a mesh's own
  `computeBoundingBox` / `matrixWorld`).
- **A quest whose first objective is "talk to X" and whose giver *is* X** needed
  two identical conversations: the generic `notify('talk')` fires when the
  conversation opens, before the player has said yes. `takeQuest` in
  `NpcDialogue.ts` accepts and notifies together.
- **`Party.snap()` is the supported way to reform after a teleport.** Stepping
  and hoping leaves three companions kilometres behind and reads exactly like a
  broken subject test.

## 9. The probes, and what each is for

New this session, all under `src/tools/probes/`, run with
`PORT=5410 node src/tools/probe.mts src/tools/probes/<name>.mts`:

| probe | answers |
|---|---|
| `mainchain.mts` | can the story get from chapter 1 to the end? **Start here.** |
| `setpiece.mts` | do the four staged fights put the right boss at the marker? |
| `rankcurve.mts` | can the hunter ladder be climbed, rung by rung? |
| `outposts.mts` | do the five outpost NPCs build, stand on real ground, and talk? |
| `dungeondoor.mts` | can a player enter, loot and leave each dungeon? |
| `photoshot.mts` | does the shutter reach the quest log? |
| `phantom.mts` | is any prompt offered where its subject is not? |
| `standingroom.mts` | where around a POI is there room to stand and be seen? |
| `poses.mts` | did the station posture reach the bones? |
| `boardanchor.mts` | do the town's published anchors sit on its fixtures? |
| `stagecam.mts` | (does not work — §7.3) |

Inherited and still the right tools: `slice.mts` (the opening, driven with real
keys), `questaudit.mts`, `huntmark.mts`, `reachall.mts`, `dens.mts`,
`ingredients.mts`, `camploop.mts`, `regioncard.mts`, `dmgnum.mts`,
`havenloc.mts`, `questchain.mts`.

## 10. The exact next step

1. **Fishing**, §7.1 — decide where it lives, then build it. It is the largest
   remaining hole in "what can a player *do*", and the world is already authored
   for it.
2. **Elemancy's missing screen**, §7.4 — a complete model with no door.
3. **The dungeon entrance coordinates**, §7.2 — once the modeling lane is off
   `src/world/dungeons/`. Same fix as the Hammerhead pin: resolve through
   `WorldMap` instead of a literal.
4. **A `startSetPiece` shot scenario**, §7.3, so a live boss fight can be looked
   at rather than only measured.

## 11. Files touched

`src/characters/npc/{NpcCast,NpcDialogue,Npcs}.ts` ·
`src/characters/enemies/{Mesmenir,Necromancer}.ts` (drop tables only) ·
`src/game/rpg/{Quests,RpgSystem}.ts` ·
`src/game/encounters/{SpawnTables,HuntRuntime}.ts` ·
`src/game/story/StorySystem.ts` ·
`src/ui/screens/{PhotoScreen,HuntBoardScreen}.ts` ·
`src/world/dungeons/Dungeons.ts` (**interaction wiring only** — `_wireInteraction`,
`_syncVerb`, two fields, the `update` early-return, and the stale class
docstring; no geometry, no `DungeonDef`) ·
`src/tools/integration.mts` · eleven new probes.
