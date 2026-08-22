# FFXV — Content & Gameplay Plan

Status: PROPOSED (2026-08-17, opus). No game code is changed by this file.
Runs as phase 4; re-audit first, per `2026-08-22-opus-phase4-content-and-gameplay.md`.
Author: Game Design & Content Planning pass, against commit `b676732`.

---

## 0. The one-paragraph version

We have built a renderer with an RPG library bolted to the side of it and no
wire between them. `src/game/rpg/**` is 5,765 lines of correct, tested-looking
quest / inventory / ascension / day-cycle logic, and **nothing outside that
directory imports it** — the HUD, the menus and the combat system all read
hardcoded fallback tables in `src/ui/GameData.ts`. The single highest-value
action in this project is not authoring new content; it is *connecting the
content that already exists*. After that, the minimum set that turns this into a
game is: a live encounter loop (spawn → aggro → fight → EXP → drops → back to
field), Hammerhead as a real interactable place, the camp/rest cycle, and the
Regalia as a vehicle. Performance work is not optional and not deferrable — but
only one piece of it (the 15.8-second shader-compile freeze) blocks content
work, and that piece is a one-day fix.

---

## 1. Audit — what exists, what is stubbed, what is missing

### 1.1 What genuinely exists and works

**Rendering (the bulk of the project, ~24k of 36.5k lines).**

| area | files | state |
|---|---|---|
| Terrain | `src/world/Terrain.ts`, `terrain/{Field,Clipmap,Layers,Road,TerrainMaterial}.ts` | 3 km eroded Leide basin, geometry clipmap (7 levels), 6-layer triplanar splat, road spline with `roadDistance()`. Real. |
| Sky/atmosphere | `src/world/Sky.ts`, `sky/{Atmosphere,Clouds,GodRays,CloudTextures}.ts` | Physically-motivated sky, volumetric-ish clouds, god rays. Real. |
| Weather | `src/world/Weather.ts`, `weather/{Rain,Wetness,Lightning,VolumePass}.ts` | `set('clear'\|'storm'\|'fog'\|'overcast')`. Real. |
| Vegetation | `src/world/Vegetation.ts`, `veg/**` | Grass fields, procedural trees/bushes, an `Ecology` sampler that also owns **site layout**. Real. |
| Props | `src/world/Props.ts`, `props/**` (3,000+ lines) | Rocks, landmarks, megastructures, road furniture, wildlife, debris, and a lofted **Regalia**. Real. |
| Post chain | `src/engine/postfx/**` (13 passes) | TAA, bloom, DoF, SSR, GTAO, motion blur, CAS, grade, exposure, contact shadows. Real. |
| Character rig | `src/characters/rig/**` (10 files) | Procedural skeleton, body, face, hair, outfit, gait, foot IK, look targets. Real, quality-limited (see §4). |
| Combat feel | `src/combat/CombatSystem.ts` (716 lines) + `Weapons.ts`, `VFX.ts` (819), `Trails.ts`, `Elemancy.ts` | Hold-to-attack combos across 5 weapon classes, dodge, hold-to-phase with MP drain and a slow-mo counter window, blindside, warp-strike and point-warp with Stasis, Armiger burst, elemancy casts. Event-emitting. Real and genuinely good. |
| Enemies | `src/characters/Enemies.ts` + `enemies/{Sabertusk,Goblin,MTSoldier,IronGiant}.ts` | 4 species, one draw call each, per-species AI states (run/pounce/telegraph/attack/stagger), HP, damage, death. Real. |
| UI chrome | `src/ui/**` (13 files + 6 screens) | Field HUD, combat HUD, weapon wheel, compass, subtitles, damage numbers, call-outs; main / inventory / ascension / map / gear / photo screens with cross-fades. Real, but see §1.2. |
| RPG logic | `src/game/rpg/**` (5,765 lines) | Level curve to 99 + EXP banking, 106-node Ascension across 9 constellations, 137 items / 37 weapons / 18 accessories / 5 shops, computed elemancy, 30 quests (7 main, 12 hunts, 11 side) with 6 tipsters and a 10-rank hunt table, 13 techniques, 30 recipes, bond levels, 10 havens, save/load with migration. Real, correct-looking, **and dead code**. |
| Tooling | `src/tools/{shoot,perf,gameplay,detcheck,ui-shoot,sheet,attrib}.mts` | Screenshot harness, frame-time benchmark, scripted-input gameplay benchmark, determinism checker. Excellent — better than most real projects have. |

### 1.2 What is stubbed — the load-bearing finding

**The RPG layer is orphaned.** Verified by grep:

```
$ grep -rn "rpg\|Rpg\|RPG" src --include=*.ts -l | grep -v "src/game/rpg/"
src/game/Game.ts
$ grep -rn "hudState\|\.quests\|\.inventory\|\.ascension\|enemyKilled\|gainExp" src --include=*.ts | grep -v "^src/game/rpg/"
(no results)
```

`Game.ts` constructs `RpgSystem` and ticks it. Nothing ever reads it. Concretely:

- **`src/ui/GameData.ts` is the actual source of truth for every UI surface.**
  The party is a literal (`Noctis, level 27, 3040/3200 HP`), the quest is a
  literal (`A Better Engine Blade — Deliver the Rare Metal to Cid`, 1240 m), the
  map pins are six literals with normalised chart coordinates, the 12 items are
  literals. None of it comes from `Inventory.ts`'s 137 items or `Quests.ts`'s 30
  quests.
- **`Player.stats` is a hardcoded object literal** — `{hp:3200, maxHp:3200,
  mp:100, maxMp:100, level:27}` (`src/characters/Player.ts:29`). `RpgSystem.update`
  *does* mirror Noctis' vitals onto it, but nothing else reads the result because
  the HUD prefers `GameData.PARTY` and only merges `Player.stats` on top.
- **`Party.stats` is `this.members.map(() => ({hp:2800, maxHp:2800}))`**
  (`src/characters/Party.ts:64`). The companions are pure followers: formation
  steering, separation, glance timers. They have **no combat AI, no techniques,
  no downed state, and never attack anything.**
- **`AscensionScreen.ts` generates its own procedural node graph** rather than
  reading `Ascension.ts`'s 106 authored nodes. Two independent ascension grids
  exist; the pretty one is fake.
- **`Director.ts` is a screenshot author, not an encounter director.**
  `setScenario('combat')` spawns six enemies at seeded offsets, **freezes them**
  (`enemies.frozen = true`) in authored poses, pins the VFX clock, and emits
  three fake `damage` events with literal numbers (1284, 486, 731). It is a photo
  booth. There is no runtime path that spawns an enemy during play.
- **The Regalia is a static prop.** `Props._buildRegalia` places a lofted body on
  the road at `z=14` and animates its headlights with the sun. There is no
  vehicle controller, no seats, no ignition, no driving.
- **Player death does nothing.** `CombatSystem._enemyStrike` decrements
  `player.stats.hp` to a floor of 0 and emits `playerHit`. Nothing listens.
- **The RPG layer's world coordinates are fiction.** `Quests.ts` waypoints
  Hammerhead at `[8, 0, -102]`, Galdin Quay at `[210, 0, 262]`, Lestallum at
  `[-40, 0, 200]`; `DayCycle.HAVENS` lists 10 havens across three regions;
  `Elemancy.DEPOSITS` lists 10 deposits. **None of these coordinates correspond
  to built geometry.** The actual world has one haven near `(-62, -46)`, one
  Coernix-style fuel stop beside the road at `z ≈ 25`, an imperial roadblock at
  `z ≈ 72`, a crashed dropship at `(-60, -230)`, a comms outpost at `≈(-150,
  -350)`, and the Regalia at `z = 14`. (Source: `Ecology._layoutSites`,
  `src/world/veg/Ecology.ts:193`.)

### 1.3 What is entirely missing

No NPC entity type of any kind. No interaction verb (nothing is pressable). No
dialogue system beyond a subtitle renderer fed by four hardcoded banter lines.
No encounter spawning, aggro, combat entry/exit, or victory state. No death,
revive, downed, or game-over. No boss. No Astrals/summons. No dungeons. No
driving, chocobos, fishing, cooking UX, shop UX, hunt-board UX, or camp UX. No
photography as a gameplay verb (the photo screen is a filter/aperture UI over
the live camera, not Prompto taking pictures). No radio or music tracks. No
in-car banter. No title screen or save/load UI. No chapter/story progression.

---

## 2. Performance — the honest numbers

From `tmp/shots/perf-baseline.json` and `tmp/shots/gameplay-baseline.json` in the repo:

**Steady-state (posed shots, 1600×900, ultra):**

| | value | budget in `BRIEF.md` | over by |
|---|---|---|---|
| mean fps across 15 shots | **17.5** | ≥45 | 2.6× |
| worst shot (`storm`) | **8.3 fps** (120.9 ms) | ≥45 | 5.4× |
| best shot (`menu_main`) | 30.2 fps | ≥45 | 1.5× |
| draw calls / frame | **9,000 – 13,600** | ~400 | **22–34×** |
| triangles / frame | **100 M – 169 M** | — | absurd |
| programs | 170 → 369 during a session | — | see below |

**Scripted gameplay (`src/tools/gameplay.mts`):**

| segment | median | p99 | max |
|---|---|---|---|
| walk | 42.3 ms | 73.7 ms | 266 ms |
| combat | 20.6 ms | 116.5 ms | 127 ms |
| warp-strike | 53.2 ms | 87.3 ms | 90 ms |
| magic | 56.4 ms | 93.4 ms | 93 ms — **plus 3 console errors** |
| **weapon-swap** | 34.9 ms | **15,819 ms** | **15,819 ms** |
| streaming-traverse | 27.9 ms | 243 ms | 755 ms |

Three separate problems, with very different costs to fix:

1. **The 15.8-second weapon-swap freeze is runtime shader compilation.**
   Program count climbs 174 → 271 → 369 as the session touches combat, warp and
   magic. `Game.init` calls `renderer.compile(scene, camera)` once, at boot, when
   the weapon cache is empty and the VFX pools are cold. The first time a
   `Weapon` of a new class is instantiated its material compiles on the main
   thread, and on Apple silicon that is seconds per program. This is a **~1 day
   fix**: instantiate all 5 weapon classes and prime the VFX/elemancy material
   pools during boot, add them to a warm-up scene, `renderer.compile()` them, and
   use `KHR_parallel_shader_compile` to poll rather than block. It must land
   first because it poisons every other agent's iteration loop.
2. **`magic` throws** `Cannot destructure property 'pos' of 'undefined'` three
   times per run — a real bug in the elemancy cast path, and a `shoot.mts`
   non-zero exit under the project's own rules.
3. **10,000 draw calls and 130 M triangles is a rendering-architecture problem**,
   not a content problem. Content work adds a handful of NPCs and one vehicle; it
   will not meaningfully move these numbers, and fixing them will not be helped
   by waiting. It is a separate, parallel workstream (§5, WS-0b).

---

## 3. The minimum content set — argued

The brief's instinct was: *drivable Regalia with party banter, one town hub with
shops, a working quest/hunt loop with real objectives and rewards, a camp/rest
cycle, and 2–3 real encounters including one boss.*

**I largely agree, but the ordering is wrong and one item is missing.** My
answer, in strict priority order:

### 3.1 Ranked by player-facing impact per unit of effort

| # | item | effort | impact | why |
|---|---|---|---|---|
| 1 | **Wire the RPG layer to the UI and combat** | S | Enormous | Converts 5,765 lines of dead code into a visible progression system. Kills a kill → banks EXP → the HUD number moves → sleeping levels you up. Almost zero new content authored. This is the cheapest "it's a game" delta available and *everything else depends on it.* |
| 2 | **A live encounter loop** | M | Enormous | Roaming packs, aggro radius, combat entry/exit, victory, drops, player death and revive. Without it, combat is a photo booth and the world is a walking sim. |
| 3 | **Hammerhead as a real place** | M | Very high | The one hub. NPCs you can stand in front of and press a key at: Cindy, Cid, Takka. Hunt board, item shop, caravan, fuel pump. It is where the quest loop closes. Build it by *promoting the existing `reststop` site*, not from scratch. |
| 4 | **Camp / rest cycle at the haven** | S | Very high | FFXV's signature loop and it is ~90 % already coded in `DayCycle.ts` + `PartyState.cook()` + `ExpBank.redeem()`. Needs a camp UX, a cooking pick-list, a sleep fade, a level-up card. Cheapest high-impact item after #1. |
| 5 | **The Regalia as a vehicle** | M–L | Very high | The single most iconic FFXV verb. Enter/exit, drive the road, Ignis auto-drive to a map waypoint, headlights, the night-daemon warning, in-car banter. |
| 6 | **Three authored encounters incl. one boss** | M | High | Gives the loop a destination. |
| 7 | **Hunt board with 6 real hunts** | S–M | High | The content that makes #2 and #3 mean something; mostly data, since `Quests.ts` already has the ranks and reward maths. |

### 3.2 Where I disagree with the brief's instinct

- **"Shops" is over-weighted.** A shop UI is a menu with a gil counter. It reads
  as game-y but adds about ten seconds of play. Ship *one* item shop with eight
  SKUs (potions, phoenix down, antidote, one weapon) and stop. `Inventory.ts`
  already has five shops with real prices; wiring one screen to one of them is
  an afternoon. Do not build weapon crafting, accessory shops, or the Regalia
  customisation shop.
- **"Party banter" is under-weighted.** Banter is the cheapest AAA-feel-per-line
  in the entire project: it is text plus a trigger table, it plays over anything,
  and FFXV is *defined* by four men talking in a car. It should be its own small
  workstream, not a rider on the driving one.
- **The brief omits the single most important item**, which is #1 above —
  connecting what exists. That is not "content", so it did not appear on the
  list, but it is worth more than items 3–7 combined.
- **"One boss" should be a named FFXV hunt mark, not a generic big enemy.**
  We have an `IronGiant` species already rigged and AI'd; re-skinning and
  re-tuning it costs far less than a new creature, and a real name plus a real
  hunt card plus a real reward is 80 % of what makes a boss read as a boss.

---

## 4. Content vs. performance vs. characters — the sequencing argument

The brief asks me not to assume content wins. It does not.

**Three tracks, one hard dependency, otherwise parallel.**

```
         ┌─────────────────────────────────────────────────────────────┐
 DAY 0   │ WS-0a  Shader pre-warm + magic crash fix   (BLOCKS ALL)     │
         └─────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
 ┌──────────────┐          ┌─────────────────┐        ┌────────────────┐
 │ WS-0b  Perf  │          │ WS-1..6 Content │        │ WS-7 Characters│
 │ draw calls,  │  (rendering-only files)    │        │ rig/** only    │
 │ tri counts   │          │ (gameplay files)│        │                │
 └──────────────┘          └─────────────────┘        └────────────────┘
```

**Why the pre-warm fix blocks everything.** A 15.8-second freeze on weapon swap
is not a polish item; it is a 15.8-second freeze *in every agent's iteration
loop*. Every content agent will swap weapons, cast magic and enter combat while
testing. It is a one-day fix (pre-instantiate the 5 weapon classes and the VFX /
elemancy material pools into a warm-up scene at boot, `renderer.compile()` them,
poll `KHR_parallel_shader_compile` instead of blocking). Ship it first. The
`magic`-segment `Cannot destructure property 'pos' of 'undefined'` crash rides
along in the same change — it is a hard rule violation (`shoot.mts` exits
non-zero on console errors) and it sits in the elemancy cast path that WS-3 will
touch.

**Why the rest of performance does *not* block content.** The 17.5 fps and the
10,000 draw calls come from the rendering architecture: 3 CSM cascades × the
clipmap × the grass field (240k blade instances at LOD0 alone) × a GTAO depth
prepass × a VFX depth prepass × SSR × contact shadows ≈ 5–6 geometry passes per
frame, before any gameplay object exists. Adding six NPCs, one vehicle and a
dozen enemies moves that number by single-digit percent. Content work is not
what made this slow and holding content until it is fixed buys nothing. Run
WS-0b as a **dedicated parallel workstream owned by a rendering agent**, with
`tmp/shots/perf-baseline.json` as the scoreboard and these targets:

- `storm` off the floor: 8.3 → ≥25 fps.
- draw calls: 10,000 → under 2,500 (the honest interim target; 400 is not
  reachable with 3 cascades plus two depth prepasses and should be renegotiated
  in `BRIEF.md`, not silently missed).
- triangles: 130 M → under 30 M. Most of this is the near grass LOD and the
  clipmap's finest ring; both have obvious knobs.
- `streaming-traverse` max 755 ms → under 100 ms (tile generation budget).

**Why the characters track runs in parallel, not after.** Characters at 5.5/10
is the thing the harsh-critic agent grades hardest in a blind side-by-side —
FFXV's four leads are the most-photographed objects in the game and ours are the
weakest surface we have. But it is *entirely* an art problem confined to
`src/characters/rig/**`. It shares no files with any content workstream. There
is no reason to serialise it. Give it to one agent for the whole run.

**Where content genuinely loses.** If we had to choose *one* thing to ship, and
the judgement is a blind screenshot comparison against real FFXV frames, the
answer is **characters, then performance, then content** — because screenshots
do not show a quest log. But we are not choosing one thing, we are allocating
parallel agents against disjoint directories, and the brief's own framing ("a
game rather than a renderer") means the judgement is no longer only screenshots.
The correct allocation is roughly **1 agent on perf, 1 on characters, 3–4 on
content**, all running concurrently after day 0.

---

## 5. Workstreams

Each is sized for one agent, end to end, with disjoint file ownership. `Game.ts`
and `Shots.ts` are shared and must be edited only by the named owner
(`WS-1`) — everyone else wires from their own system's `init()`, per `BRIEF.md`
rule 4.

### WS-0a — Shader pre-warm and the magic crash · **BLOCKING, ~1 day**

**Owns:** `src/engine/Warmup.ts` (new), `src/engine/Renderer.ts`,
`src/combat/Elemancy.ts`.
**Does:**
- Build a warm-up pass at boot: instantiate `Weapon` for all 5 classes
  (`sword`, `greatsword`, `polearm`, `daggers`, `firearm`), prime the VFX
  particle/trail/beam material pools and all 3 elemancy cast materials, add them
  to an off-screen warm scene, `renderer.compile()`, then dispose the scene and
  keep the programs.
- Use `KHR_parallel_shader_compile` (`COMPLETION_STATUS_KHR`) so the boot bar
  advances instead of the tab hanging.
- Fix `Cannot destructure property 'pos' of 'undefined'` in the elemancy cast
  path (reproduces 3× per `node src/tools/gameplay.mts` run).
**Done when:** `src/tools/gameplay.mts` reports `weapon-swap` p99 under 50 ms and
zero `failures[]` entries across all 13 segments.

### WS-0b — Rendering performance · **parallel, whole-run**

**Owns:** `src/engine/**` (except `Warmup.ts` after WS-0a lands),
`src/world/terrain/**`, `src/world/veg/**`, `src/world/sky/**`,
`src/world/weather/**`, `src/shaders/**`.
**Does:** draw-call and triangle reduction per §4 targets. Merge cascade passes,
cut the finest clipmap ring, cut LOD0 grass instance count and widen the tile
band, share the GTAO and VFX depth prepasses instead of running two, budget the
grass tile generator per frame.
**Scoreboard:** `node src/tools/perf.mts --out tmp/shots/perf-baseline.json` and
`node src/tools/gameplay.mts`. Must not regress `src/tools/detcheck.mts`.

### WS-1 — The wire: RPG ↔ UI ↔ combat ↔ world · **FIRST CONTENT WORKSTREAM**

**Owns:** `src/ui/GameData.ts`, `src/ui/HUD.ts`, `src/ui/PartyPanel.ts`,
`src/ui/CompassBar.ts`, `src/ui/screens/**`, `src/game/Game.ts`,
`src/game/Shots.ts`, `src/game/rpg/RpgSystem.ts`.

This is the keystone. Nothing else in the content plan is worth building until
the existing data reaches the screen. Concretely:

1. **Invert `GameData.ts`.** It becomes a thin adapter over
   `rpg.hudState()` with the current literals kept *only* as a fallback for when
   `game.get('Rpg')` is absent (the screenshot harness may boot without it).
   `readParty()` reads `hudState().party` (4 members with real HP/MP/level/KO/
   bond), not the `PARTY` literal.
2. **Delete the duplicate ascension grid.** `AscensionScreen.ts` currently
   generates its own procedural node layout. Replace it with
   `rpg.tables.nodes` (106 real nodes), `rpg.tables.constellations` (9), and
   `rpg.tables.edges` for the connecting lines. Wire `accept()` to
   `rpg.unlockNode(id)` and show real AP.
3. **`InventoryScreen`** reads `rpg.inventory` + `rpg.tables.items` (137 items),
   with real quantities and a real gil counter.
4. **`GearScreen`** reads `rpg.inventory.modsFor(memberId)` and equips through
   `rpg.inventory.equip()`.
5. **`MapScreen`** replaces `MAP_PINS` with `rpg.quests.waypoints()` plus haven
   and outpost markers projected from real world XZ, not normalised chart
   coordinates.
6. **HUD quest tracker** reads `hudState().tracked` and `hudState().waypoints`,
   showing the real objective text and real metre distance.
7. **HUD clock** reads `hudState().clock` / `.day` / `.phase` (`DayCycle` is
   already synced from `Sky`).
8. **Combat → RPG.** Subscribe in `RpgSystem` (or a small
   `src/game/rpg/CombatBridge.ts`) to the combat events that already exist:
   - `death` → `rpg.enemyKilled(enemyDef, { byWarpStrike, byTechnique })`
   - `warp` impact → `rpg.warpStrike()`
   - `parry` → `rpg.parry()`
   - `link` → `rpg.linkStrike(n)`
   - `stagger` → `rpg.stagger()`
   - and push `combat.inCombat` into `rpg.inCombat` each frame so the tech bar
     only charges in a fight (the flag is computed in `CombatSystem.update` and
     currently thrown away).
9. **RPG → combat.** `CombatSystem` reads Noctis' real `maxHp`/`maxMp` and the
   real weapon `atk` from `rpg.inventory` rather than the literals in
   `Weapons.ts`'s `WEAPONS` table; damage routes through `rpg.damage()`.
10. **Add gameplay shots** to `Shots.ts` so the harness can prove all this:
    `town_hammerhead`, `camp_cooking`, `hunt_board`, `regalia_driving`,
    `boss_fight`, `level_up`.

**Done when:** killing a Sabertusk moves a real EXP number in the HUD; sleeping
at the haven levels the party up; the ascension screen shows the 106 real nodes
and spending AP changes a stat.

### WS-2 — Encounters, party combat AI and death · **depends on WS-1 (8)**

**Owns:** `src/game/encounters/**` (new: `EncounterDirector.ts`, `SpawnTable.ts`,
`Aggro.ts`), `src/characters/Enemies.ts`, `src/characters/enemies/**`,
`src/characters/Party.ts` (combat behaviour only), `src/combat/CombatSystem.ts`.

**Does:**
- A real `EncounterDirector` that replaces the screenshot-only `Director`
  scenarios during play (leave `Director.setScenario` intact for the harness).
  Regional spawn tables keyed on time of day, driven off
  `rpg.daemonPressure()` which already exists:
  - **Day, Leide:** Sabertusk packs (3–5, Lv 4–8), Dualhorn pairs (Lv 8),
    Killer Wasp swarms (Lv 3), Voretooth packs (Lv 11), Anak herds (passive).
  - **Night, Leide:** Goblin groups (4–7), Imps, and — as a rare, deliberately
    terrifying spawn — a single **Iron Giant** (Lv 45+), which is exactly
    FFXV's design intent for making night driving frightening.
  - **Imperial:** an **Imperial Dropship** flyover that hovers, drops
    4–6 **Magitek Troopers** plus a **Magitek Axeman**, then ascends and
    despawns. This is FFXV's signature random encounter and we already have the
    `MTSoldier` species built.
- Aggro radius (~22 m sight, ~35 m for daemons at night), combat entry with the
  FFXV camera pull-back and the combat HUD swap, victory state, and a return to
  field after ~5 s with no live enemies in 34 m (the flag `CombatSystem` already
  computes).
- **Party combat AI.** The three companions currently never attack. Give them:
  target selection, weapon-class-appropriate approach and attack cadence
  (Gladio greatsword slow/heavy, Ignis daggers fast flurries, Prompto firearm
  from range and kiting), a downed state at 0 HP, and revive-by-teammate.
- **Techniques wired to the tech bar.** `PartyState` already defines 13 with
  real names, bar costs and motion values. Bind `L1`+direction (keyboard: hold
  `F` + `1/2/3`): **Gladiolus → Tempest (1 bar) / Impulse (2) / Dawnhammer (3)**,
  **Ignis → Analyse (1) / Enhancement (1) / Regroup (2) / Overwhelm (3)**,
  **Prompto → Piercer (1) / Recoil (2) / Starshell (2) / Gravisphere (3)**.
  Starshell must actually damage daemons — that is its whole point.
- **Player death and revive.** At 0 HP Noctis enters **Danger** (crawling, the
  FFXV red vignette), an ally revives him after ~6 s, and if the whole party
  goes down it is game over → reload last rest. Currently `hp` floors at 0 and
  nothing happens.

**Done when:** you can walk into Leide, get jumped by a Sabertusk pack, fight it
with three allies who actually swing, fire Gladio's Tempest, take EXP, and get
killed if you stand still.

### WS-3 — Hammerhead, NPCs and the interaction verb · **depends on WS-1**

**Owns:** `src/world/town/**` (new), `src/characters/npc/**` (new),
`src/game/interaction/**` (new: `Interactables.ts`, `InteractPrompt.ts`),
`src/ui/screens/ShopScreen.ts`, `src/ui/screens/HuntBoardScreen.ts` (new).

The world already has a Coernix-style fuel stop laid out beside the road at
`roadZ ≈ 25`, offset 34 m to the east (`Ecology._layoutSites`,
`src/world/veg/Ecology.ts:243`). **Promote that site into Hammerhead** rather
than build a town from scratch — the ecology sampler has already cleared the
vegetation there and the road shots already frame it.

**Build:**
- **Hammerhead** as FFXV's actual layout: the lit fuel canopy with pumps,
  **Takka's Pit Stop** diner, **Cid Sophiar's** garage with the car lift, the
  **caravan** (trailer), the hunt board on the diner wall, and the enormous
  Hammerhead sign.
- **Four NPCs**, static idle rigs reusing `characters/rig/**` with different
  outfits and no new rig work:
  | NPC | where | offers |
  |---|---|---|
  | **Cindy Aurum** | garage / car lift | Regalia: refuel (10 gil), repair, and later the Type-D quest |
  | **Cid Sophiar** | garage interior | *A Better Engine Blade* — hand over a **Rusted Bit** to upgrade the Engine Blade |
  | **Takka** | diner counter | item shop (the `hammerhead` shop in `Inventory.ts`, 13 real SKUs) + tipster for hunts |
  | **Dave** | outside the diner | the dog-tag side quests (*Gone Hunting*) |
- **The interaction verb.** There is currently *nothing pressable in the game*.
  Add a proximity interactable registry: nearest interactable within 2.5 m and
  ±60° of facing raises a prompt (`[E] Talk to Takka`), `E` fires its handler.
  This one system unlocks every NPC, the hunt board, the fuel pump, the caravan,
  the haven campfire, the Regalia door, and elemental deposits. **It is the
  single highest-leverage 200 lines in the content plan.**
- **`ShopScreen`** over `rpg.tables.shops.hammerhead` — real SKUs at real
  prices (Potion 100, Hi-Potion 400, Phoenix Down 1000, Antidote 50, Iron
  Sword, Bronze Spear, Handgun, Buckler, Bronze Bangle, Lucian Tomato, Leiden
  Pepper). Buy and sell against `rpg.inventory.gil`.
- **`HuntBoardScreen`** — see WS-4 for the content.
- **The caravan** as a paid lodging: `rpg.restAt('caravan')`. Our `LODGINGS`
  table prices it at 100 gil / 1.2×; **FFXV's real Hammerhead caravan is 30 gil
  / ×1.2** and the Longwythe Three Z's Motel is 300 gil / ×1.5 — correct the
  data. This is the non-haven half of FFXV's rest economy.

Two more real Hammerhead fixtures worth adding once the above works, both
free geometry with no new systems: **Culless Munitions** (the arms vendor — it
is a van in the car park at several outposts, so it is a prop plus a shop
handler) and **Rent-a-Bird** (the chocobo rental stand — build the sign even if
chocobos never ship; it is the kind of unbuilt-but-named detail that makes a
world read as larger than it is).

### WS-4 — The quest and hunt loop · **depends on WS-1, WS-3**

**Owns:** `src/game/rpg/Quests.ts` (data only — coordinate re-anchoring),
`src/game/quests/**` (new: `QuestRuntime.ts`, `Waypoints.ts`),
`src/ui/screens/QuestScreen.ts` (new), `src/ui/QuestTracker.ts` (new).

**The critical fix first: re-anchor the quest coordinates to the real world.**
Every waypoint in `Quests.ts`, every haven in `DayCycle.HAVENS` and every
deposit in `Elemancy.DEPOSITS` is at a made-up coordinate. Rewrite them against
the actual `Ecology.sites` layout:

| data entry | current (fictional) | should be |
|---|---|---|
| Hammerhead | `[8, 0, -102]` | the `reststop` site, `roadPoint(25, 1, 34)` |
| haven | 10 havens across 3 regions | the one real `haven` site near `(-62, -46)` + 2 new ones |
| Keycatrich Trench | `[-158, 0, -138]` | the `crashsite` at `(-60, -230)` or the `outpost` at `(-150, -350)` |
| the imperial base | — | the `blockade` at `roadPoint(72, 0, 0)` |
| fire deposit | `[42, 0, -118]` | near the `obelisk` at `(-104, -138)` |

**Then ship the hunt board with six real hunts**, all fightable with the four
species we already have, all gated on hunter rank, all paying real gil:

| # | hunt (real FFXV name) | mark | rank | lvl | where | reward | gate |
|---|---|---|---|---|---|---|---|
| 1 | **Howling Wind of Hunger** | 7× Sabertusk | ★ | 2 | Leide flats, `graze` site `(120, 60)` | 740 gil + Hi-Potion ×2 | none — the tutorial hunt |
| 2 | **Killer Wasp Nest** | 8× Killer Wasp | ★ | 3 | roadside `(58, -60)` | 800 gil + Potion ×3, Venom Fang ×2 | none |
| 3 | **Varmints of the Wastelands** | 5× Voretooth | ★★ | 5 | west of the West Scarp | 980 gil + Hi-Elixir | Rank 1 (5 stars) |
| 4 | **Gorgers in the Dust** | 3× Dualhorn | ★★ | 8 | the `graze` site `(-80, -245)` | 1,570 gil + Iron Bangle | Rank 2 |
| 5 | **Raindrops in the Night** | 6× Goblin, **night only** | ★★★ | 15 | Keycatrich ruins | 2,390 gil + Megalixir | Rank 2, after one camp |
| 6 | **The Pride of the King** | **1× Iron Giant**, night only | ★★★★★★ | 45 | the imperial `blockade` at `roadZ 72` | 10,020 gil + Mega Phoenix + **Sword of the Wise** | Rank 4 — **the boss** |

Hunter rank thresholds follow FFXV's real ladder: **Rank 1 Apprentice (5 stars),
2 Trapper (15) → Titanium Bangle, 3 Chaser (30) → Heliodor Bracelet, 4 Ranger
(50) → Silver Bangle.** Stars per hunt = the star rating. Turn-in is at any
tipster; `QuestLog` already has `huntsAt(tipsterId)` and `HUNT_RANKS` with
`gilMult` and `hunterPoints` — use them rather than reinventing.

**Plus two side quests**, both already authored in `Quests.ts`:
- **A Better Engine Blade** (Cid) — find a **Rusted Bit** in the world, return
  it, get the Engine Blade upgraded. FFXV's real chain is Engine Blade → II →
  III (Glass Gemstone) → Ultima Blade (Sturdy Helixhorn); ship the first step.
- **Gone Hunting** (Dave) — recover a fallen hunter's **dog tag** from a marked
  spot in the Three Valleys. It is a walk-there-and-press-E quest, which is
  exactly what makes it cheap and exactly what FFXV's side content *is*.

### WS-5 — Camp, cook, rest and the day cycle UX · **depends on WS-1, WS-3**

**Owns:** `src/game/camp/**` (new: `CampSystem.ts`, `CampScene.ts`),
`src/ui/screens/CampScreen.ts`, `src/ui/screens/CookScreen.ts`,
`src/ui/screens/LevelUpScreen.ts` (all new), `src/game/rpg/DayCycle.ts`.

Cheapest very-high-impact workstream in the plan: `DayCycle.rest()`,
`PartyState.cook()` and `ExpBank.redeem()` are all written and tested-looking.
What is missing is everything the player sees.

- **The haven.** `Props` already builds one at `(-62, -46)`. Add the rune ring
  glow, the tent, the campfire, and an `[E] Set up camp` interactable that only
  appears when `rpg.day.canCamp(pos).ok`.
- **The camp flow**, matching FFXV's: pick a recipe → Ignis cooks (a short
  authored sequence with the party around the fire) → the meal buff card → the
  photo review → sleep → fade → dawn → **the level-up card** showing banked EXP
  × lodging multiplier and each member's before/after level.
- **Five starting recipes** from the 30 already in `RECIPE_TABLE`, chosen so
  their ingredients drop from the enemies WS-2 spawns:
  **Cup Noodles** (rank 1), **Skewered Wild Trout**, **Lucian Tomato Stew**,
  **Toadstool Meat Skewers**, **Lasagna al Forno** (rank 4, the aspirational
  one — HP +80, EXP +10%). Buffs expire at the next sundown, per FFXV.
- **"I've come up with a new recipeh!"** — Ignis learns a recipe when a new
  ingredient first enters the inventory. Fire it as a banter line. It costs one
  event subscription and it is one of the four or five most recognisable
  moments in the entire game.
- **The lodging alternative:** the Hammerhead caravan (100 gil, 1.2×) versus
  the free haven (1.0× but cooking). That trade *is* the FFXV rest economy.
- **The night pressure loop.** `rpg.daemonPressure()` exists. Surface it: as
  dusk falls, the HUD warns, daemon spawns escalate, and the party comments.
  This is what makes havens feel like relief rather than a menu.

### WS-6 — The Regalia · **depends on WS-1, WS-3; parallel with WS-4/5**

**Owns:** `src/game/vehicle/**` (new: `RegaliaController.ts`, `DriveCamera.ts`,
`RoadFollow.ts`, `Radio.ts`), `src/world/props/Regalia.ts`,
`src/game/banter/**` (new: `BanterDirector.ts`, `BanterLines.ts`),
`src/ui/DriveHUD.ts` (new).

**Does:**
- **Enter/exit** at the parked car (the interactable from WS-3). Four seats:
  Ignis driving, Noctis shotgun, Gladio and Prompto in back.
- **Auto-drive**, FFXV's default and the one that matters: open the map, pick a
  discovered waypoint, `Drive to Hammerhead` — Ignis drives the road spline
  (`Terrain.road` already exposes `pointAt(s)`), the camera goes cinematic, and
  the party talks. This is far cheaper than a car physics model and it is what
  most players actually experienced.
- **Manual drive** on the road spline with lateral constraint (base Regalia
  cannot leave tarmac — that is canon, not a limitation). Top speed ~150 km/h.
- **Fuel** at 10 gil a fill at the Hammerhead pump; running dry strands you.
- **Night driving.** Ignis refuses to auto-drive after dark until level 30 —
  ship that refusal, it is one of FFXV's most characterful systems. Manual night
  driving raises the daemon encounter roll.
- **The radio.** `AudioSystem` already synthesises an adaptive score. Add three
  purchasable "**Memories of…**" tracks at 100 gil each from Takka's shop, and a
  radio selector in the drive HUD. Procedural, no assets, per `BRIEF.md` rule 1.
- **In-car banter — build this as its own trigger table, it is the cheapest
  AAA-feel in the project.** ~40 lines across these triggers, fired on a
  weighted cooldown: leaving/arriving at a location; a region title; passing a
  landmark; dusk falling; a hunt accepted or completed; a level-up; low fuel;
  **Prompto asking to stop for a photo**; **Ignis's "I've come up with a new
  recipeh!"**; Gladio noticing something moving; long silences. Extend
  `HUD.banter()` and `Subtitles`, which already render it — the four hardcoded
  lines in `GameData.BANTER` become a real table with speakers, weights,
  conditions and cooldowns.

### WS-7 — Character fidelity · **parallel, whole-run, no content dependency**

**Owns:** `src/characters/rig/**` only (`Anatomy`, `Body`, `Face`, `Hair`,
`Outfit`, `Geo`, `Materials`, `Skeleton`, `Anim`, `Character`),
`src/characters/Cast.ts`.
Not a content workstream; listed so the ownership map is complete and so no
content agent touches these files. Target: 5.5/10 → 8/10 on the blind
comparison, judged on `hero_closeup`, `hero_full`, `party_walk`.

---

## 6. Dependency graph and suggested order

```
WS-0a  pre-warm + crash fix          ← everything waits one day
   │
   ├── WS-0b  rendering perf ─────────────────────────── (whole run, parallel)
   ├── WS-7   characters ───────────────────────────────  (whole run, parallel)
   │
   └── WS-1  THE WIRE  (rpg ↔ ui ↔ combat)
             │
             ├── WS-2  encounters, party AI, death ── (can start at WS-1 step 8)
             ├── WS-3  Hammerhead, NPCs, interact verb
             │          │
             │          ├── WS-4  quests + hunt board  (needs WS-2 for marks)
             │          ├── WS-5  camp / cook / rest
             │          └── WS-6  Regalia + banter
```

Critical path: **WS-0a → WS-1 → WS-3 → WS-4**. WS-2 and WS-5 hang off it
cheaply. WS-6 is the longest single content item and should start as soon as
WS-3's interaction verb exists, since it needs nothing else from WS-3.

**Collision risks to watch:**
- WS-1 owns `Game.ts` and `Shots.ts`. Everyone else registers systems from their
  own `init()` and asks WS-1 for a one-line `order[]` entry.
- WS-2 and WS-1 both touch `CombatSystem.ts`. Give the file to **WS-2**; WS-1's
  combat→RPG bridge lives in a separate `src/game/rpg/CombatBridge.ts` that
  subscribes to the events `CombatSystem` already emits, so neither edits the
  other's lines.
- WS-4 edits `Quests.ts` *data*; WS-1 must not.
- WS-0b owns `src/world/veg/**`, which contains `Ecology.ts` and therefore the
  site layout WS-3 needs. WS-3 should **read** `ecology.sites` and add its own
  town geometry in `src/world/town/**` rather than editing `Ecology.ts`; if a
  new site entry is genuinely required, WS-0b makes the one-line addition.

---

## 7. What would be wasted effort

Ranked by how much time they would eat relative to what they add here.

1. **Any second region.** Duscae, Cleigne, Altissia, Niflheim. The terrain
   system is tuned for one 3 km Leide basin; a green humid Duscae is a full
   re-authoring of vegetation, terrain layers, sky and grade, and it competes
   directly with WS-0b for the same files. The `REGIONS` table can name them;
   we should never build them.
2. **The full 14-chapter story.** Chapters 9–14 are linear corridors through
   Altissia, Gralea and Zegnautus Keep — bespoke architecture, bespoke bosses,
   bespoke cutscenes, and none of it reuses the open-world systems. A
   chapter *counter* that advances 1 → 5 off main-quest completion gives the
   progression feel at 1 % of the cost. `RpgSystem.chapter` already does this.
3. **The Astrals.** Titan at the Disc of Cauthess, Leviathan over Altissia,
   Shiva, Ifrit. Each is a bespoke kilometre-scale set-piece with unique
   animation and a unique arena. Spectacular, and each would consume an entire
   workstream for one non-repeatable minute of play. If we ever want one, do
   **Ramuh** — he is a sky-based lightning nuke with no terrain requirement,
   which is by far the cheapest to fake convincingly.
4. **Dungeons.** Keycatrich Trench, Balouve Mines, Costlemark Tower, Steyliff
   Grove, Pitioss. Every one is an interior — new geometry pipeline, new
   lighting, new collision, none of which the clipmap-and-sky renderer we built
   is good at. Our engine's whole strength is exteriors. **Pitioss especially**:
   a precision-platforming dungeon needs character physics we do not have and
   would fail badly.
5. **Fishing and chocobo racing.** Both are complete self-contained minigames
   with their own control scheme, UI and tuning. Fishing needs a rod/reel/line/
   lure economy and a water-surface interaction model; racing needs a track, a
   rival AI and a lap system. High cost, and neither shows up in a screenshot.
   A **rideable chocobo** (reusing the player locomotion controller with a
   different mount rig) is a fraction of the cost of racing and delivers most of
   the recognisability — but even that sits below everything in §5.
6. **The full 13 Royal Arms with HP-drain economy.** `Inventory.ts` already
   defines eight of them with real names and stats. Ship exactly **one** — the
   **Sword of the Wise**, as the Iron Giant boss reward — with its HP drain
   working. The other twelve are twelve tomb locations we will not build.
7. **Elemancy catalyst crafting depth.** `Elemancy.ts` computes tiers,
   potencies and catalyst effects (Expericast, Healcast, Quintcast) correctly
   already. Building the full crafting *UI* with 30 catalysts is a week for a
   system the player uses twice. Ship draw-from-deposit → three fixed spell
   tiers → cast, and expose the crafting screen only if WS-4 finishes early.
8. **Regalia customisation (paint, decals, wheels, interiors).** A cosmetic
   menu on a car seen from behind at speed. The **Type-D** off-road conversion
   is a genuine gameplay unlock and worth considering; paint jobs are not.
9. **A save/load UI with multiple slots.** `SaveGame.ts` already does slots and
   migration. Autosave-on-rest plus a single Continue entry is enough; a save
   browser is menu work with no player-facing payoff at this scale.
10. **Wait Mode.** A tactical-pause layer over a combat system whose entire
    appeal is real-time flow. It is a real FFXV feature and it would be invisible
    in every screenshot and every 30-second play session we are judged on.

---

## 8. The target: a 30-minute playable slice

This is the acceptance test for the whole plan. If a player can do all of this,
we have a game.

1. **Boot into Leide at 09:00.** Noctis and the retinue on the highway, the
   Regalia parked beside them. HUD shows real level, real HP/MP, real clock, and
   the tracked quest **"The Pauper Prince — earn 1,500 gil for the repairs."**
2. **Walk to Hammerhead** (~400 m up the road). Prompto: *"Man, this heat.
   Anyone else melting?"* An **area title card** reads HAMMERHEAD · LEIDE.
3. **Talk to Takka.** Buy two Potions (200 gil). Read the **hunt board** — six
   hunts, four locked behind hunter rank. Accept **Howling Wind of Hunger**
   (★, Lv 2, 7 Sabertusk, 740 gil).
4. **Talk to Cid.** He wants a **Rusted Bit** for the Engine Blade. Quest logged.
5. **Get in the Regalia.** Ignis drives. `Drive to → Three Valleys`. Cinematic
   camera, the radio plays, and the four of them talk on the way. Prompto asks
   to stop for a photo.
6. **Fight the Sabertusk pack.** Combat camera, lock-on, hold-to-attack combo,
   a warp-strike, a phase into a parry counter, **Gladio's Tempest** off the
   tech bar. Damage numbers, blindside call-out, EXP banked. Real drops:
   Sabertusk Fang ×3.
7. **Find the Rusted Bit** on the way back, at the wrecked car on the shoulder.
8. **Return to Hammerhead.** Turn in the hunt at Takka → 740 gil, Hunter Rank 1,
   two more hunts unlock. Give Cid the Rusted Bit → Engine Blade upgraded, and
   the weapon in Noctis' hand visibly changes.
9. **Dusk falls.** Ignis: *"We should find a haven before dark."* Daemon
   pressure rises in the HUD. Drive toward the haven; Ignis will not drive at
   night, so this is manual and the Goblins are already out.
10. **Camp at the haven.** Rune ring, campfire, tent. Cook **Lucian Tomato
    Stew** — Ignis's cooking sequence, the buff card. Prompto's photos for
    review. Sleep. Fade to dawn.
11. **The level-up card.** Banked EXP × 1.0 → the party goes 2 → 6. Ascension
    now has AP to spend on real nodes.
12. **Spend AP** in the Ascension grid on **Warp Factor** (24 AP) and see the
    warp-strike hit harder.

Everything in that list is either already built or explicitly scoped in §5.
Nothing in it requires a second region, a dungeon, an Astral, or a cutscene
system.

---

## 9. Suggested chapter gating (cheap progression, no story content)

`RpgSystem.chapter` already advances on main-quest completion. Use it purely as
a content gate so the world opens up rather than sitting fully unlocked:

FFXV's Chapter 1 is called **Departure** and contains six quests in this order:
**The Pauper Prince → Hunter Becomes the Hunted → The Mutant Marauder → The
Errand Prince → A Gentleman's Agreement → Ill Tidings.** Our 30-minute slice
(§8) is almost exactly that shape already — push the car, take Dave's job,
kill the mark, run an errand — which is the strongest argument that the slice
is correctly scoped. Use the real quest names.

| chapter | quest | gate it opens | matches FFXV |
|---|---|---|---|
| **1 — Departure** | *The Pauper Prince* | Hammerhead only, the Regalia dead, on foot. Repairs cost gil you must earn. | ✔ Cindy stakes you for gas money |
| **1 — Departure** | *Hunter Becomes the Hunted* | rescue **Dave** from a Sabertusk pack → hunts unlock at Takka | ✔ verbatim |
| **1 — Departure** | *The Mutant Marauder* | kill Dave's mark → **camping and havens unlock here in FFXV too** | ✔ the real mark is **Bloodhorn**, a mutant Dualhorn |
| **1 — Departure** | *The Errand Prince* | Regalia repaired → **driving unlocks** | ✔ the run to Galdin Quay |
| **1 — Departure** | *Ill Tidings* | Insomnia falls; MT patrols and dropships begin spawning | ✔ the armistice breaks, Regis dies |
| **2 — No Turning Back** | *Legacy* / *The Power of Kings* | the tomb → **Sword of the Wise** (1st Royal Arm) + restricted manual driving | ✔ Cor leads you to the Royal Tomb |
| **2 — No Turning Back** | *Declaration of War* | the imperial blockade turns hostile | ✔ the **Norduscaen Blockade**, boss **Loqi Tummelt** |
| **3 — The Open World** | *Burden of Expectation* | **full free roam**, night daemons escalate, the boss hunt appears at rank 4 | ✔ free roam unlocks precisely here, at Coernix Station – Alstor |

Two things worth stealing exactly:

- **Camping unlocks in *The Mutant Marauder*, not at the start.** Gating the
  haven behind the first real fight makes the first camp a reward. Free.
- **Manual driving is restricted before Chapter 3** and Ignis will not drive at
  night until level 30. Both are real and both are free difficulty texture.

Chapters 4–14 should be **named in the quest log and never built**. A player
who sees "Chapter 3 of 14" reads a game with a shape; a player who sees the
Zegnautus Keep corridor we could not afford reads a demo that ran out.

**On the boss.** The canonical Chapter 1 boss is **Bloodhorn**, a mutant
Dualhorn hunted for Dave — which maps onto our slice perfectly. We do not have
a Dualhorn species; we have Sabertusk, Goblin, MT Soldier and Iron Giant. So:
- **Default:** ship the **Iron Giant** as *The Pride of the King* (Lv 47, night
  only, real hunt, 10,020 gil + Mega Phoenix), using the rig we already have.
- **If WS-2 has budget for a fifth species**, build the **Dualhorn** and ship
  **Bloodhorn** instead — it is the correct Chapter 1 boss, it is a daytime
  fight (better for screenshots), and a big charging quadruped reuses the
  Sabertusk locomotion work more than a humanoid giant does.

---

## 10. Open questions for the human

1. **The `BRIEF.md` draw-call budget of ~400 is not achievable** with 3 CSM
   cascades, a GTAO depth prepass and a separate VFX depth prepass. Should
   WS-0b renegotiate it to ~2,500, or should it cut a pass?
2. **Do we keep `Director.ts`'s frozen screenshot scenarios?** They are how
   every combat and warp capture in `tmp/shots/` was made. My assumption is yes,
   kept alongside the live `EncounterDirector`, since the harness depends on
   them and determinism is a hard rule.
3. **Is the harsh-critic agent judging screenshots only, or play?** If
   screenshots only, WS-7 (characters) outranks all content and the allocation
   in §4 should shift 2 agents from content to characters.

---

## Appendix A — FFXV reference for implementing agents

Researched against finalfantasy.fandom.com, Fextralife, Game8, PowerPyx and
GameFAQs. Keep this here so no workstream has to re-research it.

### A.1 Combat, exactly as FFXV does it

- **Attack** is *hold* Circle/B for an auto-chain into a finisher; *tap* for
  discrete strikes you can mix manually. Tilting the stick during an attack
  gives a directional variant. **Sprint** is the same button held while moving,
  on a stamina bar that forces a stop when it empties.
- **Defend** is *hold* Square/X and auto-dodges at a continuous MP drain; it does
  **not** work against unblockable heavy attacks. A **parry prompt** appears on
  some incoming attacks; a successful parry chains into a **counter** prompt.
  **Tap** the same button to roll.
- **Blindside**: attacking from behind gives an automatic special (~+50 %
  damage). With sword / greatsword / polearm equipped it can trigger a
  **Blindside Link** that pulls in an ally for a joint attack.
- **Warp-strike**: Triangle/Y, ~30 MP base, **damage scales with distance
  covered**, invulnerable during the warp. **Point-warp** to a stationary point
  fully restores MP and regenerates HP while hanging — it is the primary
  in-combat recovery tool, not a movement toy.
- **Stasis**: MP hits zero → no warping, no phasing, no MP abilities until it
  refills. Sword hits accelerate MP recovery; that is *why* the sword class
  exists.
- **Tech bar**: 3 segments, filled by allies landing attacks and defending.
  `L1/LB` + d-pad direction — **up = Ignis, left = Prompto, right = Gladiolus,
  down = guest**. Both Noctis and the acting ally get i-frames during the
  animation, and it opens a manual follow-up prompt.
- **Weapon classes** and what they are *for*: **Swords** balanced + MP recovery
  on hit; **Greatswords** highest raw ATK, best stagger, most reliable
  link-strikes — use against Iron Giants and behemoths; **Daggers** fast, high
  mobility, good against small fast enemies; **Polearms** wide sweep, good into
  packs; **Firearms** no combos, rapid fire, reload, good at range; **Shields**
  block for less MP than phasing but cost DPS.
- **Armiger**: gauge fills from hits (~100 per warp-strike, ~1,600 for a charged
  greatsword swing, cap ~40,000). Active ~10 s; cycles all collected Royal Arms
  with the HP-drain penalty suspended. Dropping into Danger ejects you but keeps
  the gauge. **Armiger Chain** spends the whole bar on a four-man assault.
- **Royal Arms** drain Noctis' own HP on every hit outside Armiger, warp-strikes
  draining more. Real stats: Sword of the Wise ATK 194 / +100 HP; Blade of the
  Mystic 396 / +150 HP; Greatsword of the Tall 518 / +200 HP; Axe of the
  Conqueror 483; Shield of the Just 251 / +1000 HP / −50 MP; Trident of the
  Oracle 388 / +60 MP; Sword of the Father 141 (the last one, Chapter 13).
- **Elemancy**: drain Fire/Ice/Lightning from world deposits, max 99 each. 100
  potency → tier 2 (Fira/Blizzara/Thundara), 200 → tier 3 (-ga). Catalysts add
  effects: **Dualcast…Quintcast** (2–5 casts), **Healcast** (heals % max HP =
  effect level), **Expericast** (bonus EXP = level × 100), Stopcast, Killcast,
  Freecast, Maxicast. **Spells friendly-fire your own party.**
- **Ring of the Lucii**: MAG+3, SPR+3, ATK+30 %, MAG+30 %. **Death** (DoT that
  executes and heals you), **Holy** (dodge counter, restores MP), **Alterna**
  (spends a full MP bar, no Stasis, deletes the target from the fight).
- **Summon triggers** are checked roughly every 10 s and need a party condition
  *and* a terrain condition together: **Ramuh** — long battle duration, works
  almost anywhere including indoors; **Titan** — allies in Danger/Down, needs a
  large open outdoor area; **Leviathan** — Noctis himself in Danger, near a large
  body of water; **Shiva** — accumulated KOs + duration + Danger; **Bahamut** —
  scripted only; **Carbuncle** — extreme danger, heals rather than nukes.
- **Wait Mode** freezes enemies while Noctis acts; required for **Libra**
  (hold R1/RB to scan → level, HP, and colour-coded resistances: orange = weak,
  purple = resistant, white = neutral).

### A.2 Hunts and hunter rank (real ladder)

Hunts come from **tipsters** at diners and outposts; yellow markers are easy,
red are hard. Stars accumulate into Hunter Rank; each rank unlocks tougher hunts
and pays a one-time accessory. Patch 1.17 raised the cap from 1 to **10
simultaneous hunts**. Turn-in works at any tipster.

| rank | name | stars | reward |
|---|---|---|---|
| 1 | Apprentice | 5 | — |
| 2 | Trapper | 15 | Titanium Bangle |
| 3 | Chaser | 30 | Heliodor Bracelet |
| 4 | Ranger | 50 | Silver Bangle |
| 5 | Slayer | 40 | Sapphire Bracelet |
| 6 | Officer | 40 | Gold Bangle |
| 7 | Guardian | 40 | Black Choker |
| 8 | Grandmaster | 30 | Blue Diamond Bracelet |
| 9 | Hand of Mercy | 43 | Centurion Bangle |
| 10 | Alleyway Jack | — | Dark Matter Bracelet |

Real early hunts, all at Hammerhead unless noted: **Howling Wind of Hunger**
(Lv 2, 7× Sabertusk, 740 gil + Hi-Elixir), **Varmints of the Wastelands**
(Lv 5, 980 gil + Hi-Elixir), **Gorgers in the Dust** (Lv 7, 1,570 gil + Iron
Bangle), **Raindrops in the Night** (Lv 15, 2,390 gil + Megalixir), **Galloping
Garulas** (Lv 12, Coernix Station–Alstor, 2,010 gil), **Peace to the Beach**
(Lv 11, Galdin Quay, 1,950 gil), **A Behemoth Undertaking** (Lv 15, Wiz Chocobo
Post — the Deadeye hunt, 3,020 gil + Amethyst Bracelet), **The Pride of the
King** (Lv 47, Keycatrich, 10,020 gil + Mega Phoenix), **Lonely Rumblings in
Longwythe** (the Adamantoise, Lv 99, ~5.6 M HP).

### A.3 The Regalia, exactly as FFXV does it

- Two modes: **Auto** (Ignis drives; pick a destination from the map, "Drive
  to…") and **Manual** (unlocked after Chapter 3). The base car **cannot leave
  the road** — that is canon.
- **Refuel: a flat 10 gil** at any station (5 with the Gas Coupon). Running dry
  strands you; a tow is ~100 gil.
- **Ignis refuses to drive at night** ("The road is perilous…") until **character
  level 30**. That refusal is a real, characterful gate — ship it.
- **Type-D** off-road: Chapter 8, Cindy's *Into Uncharted Territory* — fetch
  four off-road tires from the **Norduscaen Blockade**.
- **Type-F** flying: Chapter 15 — **Warped Wings** (Aracheole Stronghold),
  **Unstable Stabilizer** (Fort Vaullerey), **Strange Engine** (Formouth
  Garrison) → Cindy's *Into Unknown Frontiers*.
- **Radio**: "Memories of [Final Fantasy N]" cassette albums, **~100 gil each**
  from item shops. You select an album, you cannot tune stations.
- **Banter triggers**: region, time of day, quest flags and bonds. Recurring:
  Prompto asking to stop for a photo; **Ignis's "I've come up with a new
  recipeh!"** when he learns a dish; comments on a hunt just finished; party
  members visibly falling asleep on long drives; a quieter, tenser tone at night.
- **Chocobos**: Wiz Chocobo Post, **50 gil/day**, rentable 1–7 days. The
  **Chocobo Whistle** is the reward for killing **Deadeye**. Greens: Mimett
  (stamina), Curiel (speed), Reagan (jump), Sylkis (all). Chocobos dash, swim,
  jump and glide; the Regalia does none of those.

### A.4 Camp, cook and rest

- **EXP is banked and only applied when you sleep.** Havens are free, 1.0×, and
  are the only place Ignis cooks. Paid lodging multiplies the banked total but
  has no cooking: roadside motels ~300 gil / **1.5×**; Galdin Quay ~10,000 gil /
  **2×**; the Leville Royal Suite **3×**.
- Meal buffs last **12 in-game hours** by default, extendable to 24/36/48 via
  the Ascension "Aftertaste" nodes. A member's **favourite dish** either doubles
  Noctis' tech-bar fill rate or makes that ally's techniques always crit.
- Recipes are learned by eating out, seeing an NPC eat something, reading a sign
  or magazine, **acquiring an ingredient for the first time**, or a quest reward
  — and announced with "I've come up with a new recipeh!"
- Real buffs for scale: Croque Madame ATK +3; Lasagna al Forno HP +80, EXP
  +10 %, nullifies Fire/Ice/Lightning; Kenny's Original ATK +40 MAG +30 DEF +30;
  Longwythe's Peak ATK +60 HP +80.
- **Photos** accumulate to ~10 pending (20 with the Camera Strip) and are
  reviewed at every rest; the permanent gallery caps at 200.

### A.5 Ascension abilities worth shipping (real AP costs)

**Airstep** 6 · **Warp Factor** 24 · **Warp Factor II** 52 · **Blink** 16 (free
phase) · **Deathblow** 16 (allies finish staggered enemies) · **Happy Camping**
20 / **Happier Camping** 48 (AP from camping) · **Roadrunning** 32 /
**Roadlife** 99 (AP+EXP from driving) · **Angler Action** 18 · **Snapshot** 12
(Prompto photographs mid-battle) · **Point-Blank Warp-Strike** 333 · **Airdance**
333 · **Impervious** 333 · **Ultimate Deathblow** 99.

### A.6 Controls to match

| action | pad | keyboard (ours today) |
|---|---|---|
| attack (hold = combo) | Circle / B | LMB |
| defend / phase (hold), roll (tap) | Square / X | RMB / Space |
| warp-strike | Triangle / Y | `Q` |
| point-warp | Triangle at a point | `E` |
| techniques | L1/LB + d-pad | *(to add: hold `F` + 1/2/3)* |
| weapon swap | d-pad | `1`–`5` |
| lock-on | R1 / RB | `Tab` |
| item wheel | R2 / RT | *(to add)* |
| Armiger | L1+R1 | `R` |
| interact | Circle / A | *(to add: `E`)* |
| menu | Options / Start | `Tab` (conflicts with lock-on — resolve in WS-1) |

**Note the conflict:** `Tab` is bound to both lock-on (`CombatSystem._readInput`)
and the main menu (`Menus._input`), and `KeyC` is bound to both photo mode and
lightning elemancy. WS-1 owns resolving the keymap.

---

## Appendix B — the naming pass (nearly free, disproportionately effective)

Our world geometry is generic — `blackrockMesa`, `eastButtes`, `reststop`,
`blockade`, `crashsite`, `haven`. Every one of them has a real Leide counterpart
in FFXV. Renaming them costs a string table and an area-title-card call, and it
is the cheapest single thing in this document that makes the world read as Eos
rather than as a terrain demo. **WS-3 should do this in an afternoon.**

*Ownership note:* the landmark keys live in `src/world/terrain/Field.ts` and the
site types in `src/world/veg/Ecology.ts`, both owned by WS-0b. So WS-3 must not
rename them in place. Instead WS-3 adds `src/world/town/PlaceNames.ts` mapping
`{ landmarkKey | siteType | worldXZ } → { name, region, kind }` and drives the
area title card and the map screen from that. The internal identifiers stay as
they are; only what the player sees changes.

| our identifier | where | real FFXV name to use | why it fits |
|---|---|---|---|
| `LANDMARKS.blackrockMesa` (−215, −395) h108 | hero mesa on most vista sight-lines | **Longwythe Peak** | Leide's signature colossal crag and its most photographed landmark |
| `LANDMARKS.eastButtes` (305, −300) | butte cluster NE | **The Three Valleys** | Leide's arid, sandstorm-prone ruin country |
| `LANDMARKS.westScarp` (−350, 300) | mesa west | **Saulhend Pass** | real Leide pass |
| `LANDMARKS.spireRidge` (−545, 350) | spires | **Callnegh Steps** | the Balouve Mines approach |
| `LANDMARKS.canyon` (60, 430) | canyon | **Ostium Gorge** | far-east Leide, holds Crestholm Channels |
| `LANDMARKS.basin` (0,0) + the grass flats | the spawn basin | **The Weaverwilds** | the plain between Hammerhead and Longwythe Peak |
| `reststop` site, `roadPoint(25, 1, 34)` | the fuel stop | **Hammerhead** | Cid + Cindy's garage, Takka's Pit Stop, Culless Munitions, Rent-a-Bird |
| `blockade` site, `roadPoint(72, 0, 0)` | straddles the carriageway | **Norduscaen Blockade** | the Chapter 2 road blockade where Loqi is fought |
| `outpost` site (−150, −350) | comms mast + containers at the mesa foot | **Formouth Garrison** | northern-Leide imperial base |
| `crashsite` (−60, −230) | crashed magitek dropship | **Keycatrich Ruins** | the ruined Leide settlement near the Trench |
| `haven` site (−62, −46) | the one real campsite | **Cotisse Haven** | a real Leide haven name |
| `shack` site, `roadPoint(96, 1, 15)` | abandoned roadside outpost | **Longwythe Rest Area** | Three Z's Motel + Crow's Nest Diner, if a second hub is ever wanted |
| `ruins` (−500, 330) | Solheim columns | **Balouve Mines** entrance | Leide's eastern dungeon mouth |
| `watertower` (268, −258) | East Buttes bench | **Vannath Coast** water tower | the Galdin approach |

Other free naming wins:
- **Havens** — `DayCycle.HAVENS` invents ten. The real Leide haven names are
  **Cotisse, Circlawe, Merrioth, Pallebram, Lepellieth, Emmelle, Vennaugh,
  Lachyrte, Fayemoor**. Use three of these for the three havens we will actually
  build and delete the rest.
- **Shops** — the arms vendor everywhere in Lucis is **Culless Munitions**; the
  Hammerhead diner is **Takka's Pit Stop**; the chocobo stand is **Rent-a-Bird**;
  the diner chain is **Crow's Nest**; the general store chain is **JM Market**.
- **The tipster table in `Quests.ts`** already names Takka, Coctura, Ezma and
  Dave correctly. Keep them. `Kimya` and `Old Lestif` are invented — replace
  with **Monica Elshett** (the hunter liaison introduced at Prairie Outpost) and
  **Dustin Ackers**, who are real and are exactly this role.
- **The area title card** (`HUD.areaTitle`) already exists and is unused. Fire
  it on region entry: `HAMMERHEAD · LEIDE`, `THE WEAVERWILDS · LEIDE`,
  `NORDUSCAEN BLOCKADE · LEIDE`. Three lines of code for one of FFXV's most
  recognisable presentation beats.

### One correction to §7 in light of the story research

**Chapter 15 / the World of Ruin is worth exactly one thing:** the ten-year
time-skip means FFXV's own endgame is *the same open world at permanent night*.
If we ever want a second "region" at near-zero cost, it is not Duscae — it is
**Leide under the Long Night**: the terrain we already have, the weather system
we already have, locked to night, with the daemon spawn tables from WS-2 turned
up and Hammerhead lit as the last refuge. That is a palette-and-spawn-table
change, not a new region. It is the only cheap content expansion in the entire
game and it should be the first thing considered after the §8 slice lands.
