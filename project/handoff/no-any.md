# Goal: strictly and statically typed, with no `any` — implicit or explicit

**Status:** in progress. **5,253 `any` left**, from 7,861 at the start — 33%
gone. Both typechecks clean, all 9 gates green, `vite build` passes, the pixel
diff against the pre-port build is inside each shot's own noise.

The port itself is finished and documented separately in
`project/handoff/typescript.md`. This document is only about getting to zero.

---

## The ratchet

    node src/tools/anycheck.mts             # count + enforce
    node src/tools/anycheck.mts --by-file   # worst files first
    node src/tools/anycheck.mts --set       # lower the ceiling after a reduction

`ANY_BUDGET.json` holds the ceiling. The count only goes down; nothing raises it
but an edit to that file. It strips comments and string literals before
counting, so the word `any` in prose does not register.

**It is not wired into `npm run check` or the pre-commit hook yet.** That is a
deliberate gap — wiring it in while the number is still five figures would make
every unrelated commit carry the argument. Wire it into `check.mts` once the
number is small enough that a regression is worth blocking on.

## Where the remaining 5,253 are

| kind | count | notes |
|---|---|---|
| parameters `p: any` | ~3,850 | the bulk; see the waves below |
| field declarations `x!: any` | ~790 | what the checker could not agree on |
| `any[]` | 258 | mostly accumulator arrays |
| `Record<string, any>` and other type arguments | 111 | authored data tables |
| `as any` | 27 | each one a deliberate assertion, mostly three.js internals |

Worst files, which is where the next hour should go:

```
124  src/world/dungeons/kit/InteriorProps.ts
106  src/audio/Sfx.ts
103  src/characters/enemies/EnemyBase.ts
103  src/characters/rig/Outfit.ts
 99  src/world/props/PoiKits.ts
 87  src/world/town/TownMaterials.ts
 78  src/world/town/Hammerhead.ts
 74  src/world/dungeons/kit/InteriorMaterials.ts
 69  src/world/dungeons/kit/Layout.ts
 68  src/combat/CombatSystem.ts
```

They are all the same shape: a procedural builder taking `(B, ctx, o)` where `B`
is a mesh builder, `ctx` is the room or outfit context and `o` is an options
bag. **That is the next real piece of design work** — three or four interfaces
would take a four-figure bite out of the count, and unlike the mechanical waves
it needs someone to decide what the contracts are.

## The engine: `src/tools/typemods/`

Read `src/tools/typemods/README.md` first. The short version:

    node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --fields --dry
    node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --params

`infer` is the one that does the work. `--fields` gives a field the type of what
is assigned to it; `--params` gives a parameter the type of what its callers
pass — each only when every site agrees on one clean named type, and refusing
anonymous shapes, function types and unions wider than `T | null`, because the
point is types a reader can use.

Two traps, both of which cost a round here and are in the README:

- **Pass the repo root as an absolute path.** A relative root makes
  `parseJsonConfigFileContent` resolve a config with an `exclude` against the
  wrong base and hand back 2 files instead of 37 — which looks exactly like
  "nothing left to infer".
- **`unused --impure` deletes statements, not just bindings.** It removed four
  `const e = pin(spawnAhead('sabertusk'))` lines from `combatloop`, and with
  them the enemy the swing was supposed to hit.

## The loop that works

1. `node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --fields`
2. `node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --params`
3. Repeat 1–2 until both report zero. Each round makes more types real, which
   lets the next round infer more; it converged after 3–4 rounds each time.
4. `npx tsc --noEmit -p tsconfig.json` — **the errors are the point.** A type
   that was `any` could not be wrong; the moment it is real, everything that
   disagreed with it shows up.
5. Fix those by hand. Run the mechanical helpers (`nonnull`, `nulls`,
   `undefnull`) for the null-flavoured ones first, then read the rest.
6. `npx tsc --noEmit -p tsconfig.tools.json` too — the tools config reaches into
   the game through `src/globals.d.ts`, so game changes can break it.
7. `npm run check` before committing a wave. Not the cheap half.

## What has been found so far

Six pieces of contract drift in the port itself (see `typescript.md`), and four
more from this work:

- **`AudioSystem.ambBus` does not exist**, and `DungeonAmbience.ready` tested
  for it — so the dungeon ambience has never played a note. The reference is
  corrected to `graph.bus.amb`, but the system is held off behind
  `DungeonAmbience.ENABLED = false`: switching a whole audio system on is not
  something a typing pass gets to decide. **This is the top open item** — flip
  it, listen to it, and report what happens.
- **`CameraRig` has no `snap()`**, and `Dungeons` called it behind a
  `if (cam && cam.snap)` guard on entering and leaving a dungeon. The camera has
  never cut on a transition. Removed, with `CameraRig._cut()` named as the
  method that would do it.
- **`ParticleSpec.t0`/`life`/`size0` were optional** and would have written NaN
  into a `Float32Array`. All 22 emit sites pass them; they are required now.
- **`BakeSection.n`/`w`/`h`/`ch` were optional** and fed `new
  Float32Array(undefined)`. `sectionField()` throws with the section name
  instead.

## Vocabulary added, and worth reusing

- `src/util/three-guards.ts` — `isMesh`, `isBone`, `isLight`, `isCamera` … for
  three's runtime discriminants, which `Object3D` does not declare. **Prefer
  these to a cast**: a guard narrows, so the branch below gets the real type.
- `src/audio/nodes.ts` — `canStop`, `canDetune` for the mixed audio node lists.
- `CachedNode` in `src/ui/UIKit.ts` — the "element that remembers what it last
  rendered" the screens use to skip DOM writes at 60 Hz.
- `PoiSpec` vs `Poi`, `Landform`'s six arms, `WeatherName`, `ObjectiveKind`,
  `StatMods`, `CoatOpts`, `ParticleSpec` — the pattern to copy is **split the
  authored shape from the resolved one** rather than making everything optional.

## Rules this work has been following

- **A type is a claim about the code, so make the code true, not the type
  loose.** Where a field is genuinely two things, split the type (`PoiSpec` /
  `Poi`, `DiscLandform` / `CraterLandform`). Where the guard is dead, say so.
- **Assert once, where the reasoning lives.** The first pass at the canvas
  contexts put 331 `c!.` assertions across the drawing code; the assertion
  belongs at the nine `getContext('2d')!` calls.
- **Behaviour does not change.** Every wave is verified by `npm run check` and,
  for anything that could move a pixel, by `imgdiff` against a capture from
  before. A found bug gets recorded and left alone unless fixing it is the
  point of the commit.
- **`unknown` beats `any`** where a value really is dynamic — it forces the
  narrow at the point of use.

## Known debt beyond the count

- `src/tools/typemods/**` is excluded from the tools typecheck and from the
  count. It drives the compiler API, which is `any`-heavy by nature. Type it
  last, or delete it when the job is done.
- `src/tools/browser.d.ts` declares the harness's in-page URL imports as `any`.
  Typing them properly means teaching the tools config about the game's module
  graph — worth doing near the end.
- `anycheck` is not in `npm run check` yet. See above.

## `src/characters/` outside `enemies/` and `rig/` — done, 163 → 0

`Player.ts`, `Party.ts`, `Enemies.ts`, `Cast.ts`, `ai/**` and `npc/**` are at
zero. No `as any`, no `as unknown as`, no `@ts-ignore`, no new `!`.

### The types that carry it

| type | where | what it is |
|---|---|---|
| `PartyMember`, `CompanionKey`, `CompanionState` | `Party.ts` | one companion. The fields are grouped by **owner** — `Party` steers, `PartyAI` fights, the encounter layer taunts — and `Party.init` now seeds the `PartyAI`-owned block with exactly the values `PartyAI.init` re-arms it with, so a member is never half a member. |
| `Vitals` | `Player.ts` | the HP/MP block `RpgSystem` mirrors onto `Player.stats` and every `PartyMember.stats`. |
| `CompanionRole`, `CarrySpec`, `CarryTransform`, `StrikeOpts`, `PendingHit`, `TechniqueResult` | `ai/PartyAI.ts` | the `ROLES`/`CARRY` tables, and the split between a blow **as authored** (`StrikeOpts`) and a blow **in flight** (`PendingHit extends StrikeOpts`). |
| `SpawnPlacement` | `Enemies.ts` | one *placement* — position, pack, patrol, owning encounter. Deliberately not `SpawnOpts`, which is what varies between two *instances* of a creature. |
| `Npc`, `NpcPlacement`, `PostureBias`, `PostureName`, `NpcTask` | `npc/Npcs.ts` | a townsperson as placed, versus `NpcCastDef` (who they are). |
| `NpcCastDef` | `npc/NpcCast.ts` | `CharacterDef` plus the job title and portrait hue only a townsperson has. `NPC_CAST` now `satisfies Record<string, NpcCastDef>`. |
| `NpcArchetype`, `SharedNpcAssets`, `HairSetOpts` | `npc/NpcRig.ts`, `npc/NpcCast.ts` | the per-look build, and what a caller may vary about `hairSet`. |
| `DialogueChoice` | `npc/NpcDialogue.ts` | one choice row. **Belongs on `Dialogue.start` once that gains a script type** — it is here only because `Dialogue` is still untyped. |

`npc/NpcRig.ts`'s `NpcBody` now `implements AnimTarget`, as the `rig/` handoff
asked: the townsfolk path and the party path are checked against one contract.

### Bugs found

- **`AssetBrowser._enemy` pivoted every creature around a hard-coded 1.1 m.**
  `e.stats && e.stats.height` — an `Enemy` has no `stats`; the species stats are
  `e.type.stats` and the instance copy is `e.height`. Provably-dead guard, so it
  is fixed (`e.height || 2`). Dev-only path.
- **`CombatHUD`: `e2.type?.weakness || e2.weak || tpl.weak`** — nothing has ever
  assigned `Enemy.weak`. Dead arm removed; the live first arm is unchanged.
- **`Minimap` reads `m.position || m.root?.position` over party members and
  `e.position || e.root?.position` over enemies.** Neither `PartyMember` nor (until
  recently) `Enemy` published `position`. Left alone — `Enemies.list` is typed now
  and `Enemy` has grown a `position` getter, so only the party arm is still dead,
  and `Minimap.party` is `any` so it does not break the build.
- **`Enemy.analysed` was undeclared.** Ignis' Analyse writes it, `EncounterDirector`
  decays it, `PartyAI.strike` reads it for the +15%. Now declared and initialised in
  the constructor. **`despawn()` does not clear it**, so a pooled enemy comes back
  still analysed — recorded, not changed.
- **`Enemy.status` is written and never read.** `CombatSystem._applySpellEffects`
  stamps `{kind, until}` on every enemy in the blast; nothing expires it, nothing
  reads it, the HUD does not draw it. Every status-effect catalyst is inert.
  (The combat workstream found the same thing independently — see `CombatTarget`.)
- **`death.by` / `death.byTechnique` / `link.member` are dead payload.**
  `PartyAI` stamps who landed the kill, but `EncounterDirector` subscribes with
  `onDeath(d.enemy, 'player')` — the credit is hard-coded — so the `'tech'` branch of
  `onDeath` and the **`tech-finish` AP award it gates are unreachable**. Nothing else
  passes `'ally'` or `'tech'` either. Documented in `CombatEvents`, not changed.
- **`StrikeOpts.ignoreArmour`** is authored by Prompto's Piercer and never forwarded
  to `Enemy.hit`; `HitOpts` has no such field. Declared with the note.
- **`Tech.motion`** is authored on all twelve techniques and read by nothing — each
  `run` states its own per-blow motion.
- **`Party.update` dereferenced `this.terrain` unguarded** on the no-collision path,
  while the two other reads in the same file guard it. Guarded to match (`: 0`).
- **Not a bug, a trap:** there are two `WeaponClass` unions. `combat/Weapons.ts` has
  the *model* classes (Ignis carries `daggers`); `game/rpg/Stats.ts` has the *damage*
  classes (Ignis' class is `dagger`, which is also what every species' `weakTo` says).
  `ROLES.ignis` naming both is correct. `CompanionRole` now imports them under two
  names so the next reader cannot merge them.

### Changed outside `src/characters/{ai,npc}` and the four top-level files

All forced by typing a receiver, all small, all listed here on purpose:

- `enemies/EnemyBase.ts` — declared `analysed` (+ `= 0` in the constructor) and
  optional `status` in the existing "owned by the encounter layer" block.
- `combat/CombatEvents.ts` — `damage.source` (**read** by `CombatBridge._onDamage`,
  and it was missing), plus `death.by`, `death.byTechnique`, `link.member` as
  optional-and-documented-as-unread.
- `ui/CombatHUD.ts`, `dev/AssetBrowser.ts` — the two dead arms above.

## `src/characters/enemies/` — done, 480 → 0

Twenty-seven files: `EnemyBase.ts`, the two body archetypes, twenty-one species,
`RigBuilder.ts`, `Bestiary.ts`, `Palette.ts`. No `as any`, no `as unknown as`,
no `@ts-ignore`, no new `!`. `creaturecheck` is green: 207 poses, 23 species,
0 failures.

### The contract, and why it is three shapes and not one

Everything hung off one `any`: `Enemy.type`. Naming it split into three, and
the split is the whole point — the same field is optional in one and required
in the next, which is what makes the defaults visible instead of implied.

| type | where | what it is |
|---|---|---|
| `SpeciesDef` | `EnemyBase.ts` | a species **as its author writes it**. `senses.sight` is optional because a species may leave it to `stats.aggroRange`; `stats` is `EnemyStats` with every field required, because no species has ever omitted one. |
| `SpawnOpts` | `EnemyBase.ts` | what varies between two *instances*: `id`, `scale`, `level`, `maxHp`. What `make()` and `reset()` take. (`Enemies.SpawnPlacement` is the third thing again — where in the world it goes.) |
| `EnemyCtx` | `EnemyBase.ts` | what the world hands the AI each frame. `terrain`/`player`/`threats` are `?` because they come from `Game.get()`, which returns `undefined` for a system the current scenario never registered. |
| `EnemyStats`, `EnemyAttack`, `SpeciesSenses`, `EnemyDrop`, `ResistTable` | `EnemyBase.ts` | the leaves of a definition. `EnemyAttack extends Partial<AttackTiming>` — an attack that states no timing inherits the species', which is exactly what `_timing()` resolves. |
| `SpeciesOverride` | `Bestiary.ts` | what a *mark* may restate. `Partial<Omit<SpeciesDef, …>> & { stats?: Partial<EnemyStats> }`: Bloodhorn restates `hp` without restating `attackRange`, and cannot restate `make`. |
| `Faction`, `ExpClass`, `AiState`, `PoseName`, `EnemyState`, `PackRole` | `EnemyBase.ts` | the closed sets. `AiState` is what the `update()` switch dispatches on; `PoseName` is what `pose()` answers to; `EnemyState = AiState \| PoseName` because `freeze()` writes a *pose* name into `state`. `POSE_NAMES` + `isPoseName()` are the guard for the strings that cross a boundary. |
| `EnemyRig`, `EnemyPrototype`, `GroundCal` | `EnemyBase.ts` | the cloned skeleton, what `buildPrototype()` returns, and the measured lift curves. `EnemyRig` satisfies `CreatureAnimTarget['rig']`. |
| `Threat`, `PatrolRoute`, `EnemyPack`, `GroundSampler`, `HitOpts`, `HitResult`, `EnemyStatus`, `FrozenPose` | `EnemyBase.ts` | the surfaces the AI touches. `EnemyPack` is only the five calls `Enemy` makes on `game/encounters/Pack.ts`, so the pack's own bookkeeping stays its business. |
| `threatPos(t)` | `EnemyBase.ts` | **the one place that knows both arms of `t.position \|\| t.root?.position` are live.** The player publishes `position`; a companion is the plain formation record in `Party.members`, which has no `position` and keeps its transform on `root`. Three call sites now share it. |
| `BipedAnim`, `BipedFoot`, `BipedStance`, `HeadAim`, `AttackEnvelope` | `Biped.ts` | the second contract: the tuning block a two-legged species declares. Required means *read with no default*. |
| `QuadAnim`, `QuadFoot`, `QuadStance`, `HeadAim`, `LegId`, `TrunkComp` | `Quadruped.ts` | the same for four legs. `TrunkComp` is the `RootMotion` pair the leg IK cancels out. |
| `Bind`, `Part`, `PosableRig`, `BoneWriter` | `RigBuilder.ts` | `['bone', name] \| ['chain', names]` — the tuple the species files write hundreds of inline. Five species had it spelled out longhand; it is one name now. |

`static ANIM` reaches its own subclass through `declare ['constructor']:
typeof BipedEnemy`, not a cast, so `this.A` is `BipedAnim` with no assertion
anywhere. Every species definition is `satisfies SpeciesDef`, which keeps the
literal type (so `TYPES.titan.buriedBase` is still `true`) *and* checks it.
`TYPES` is `Record<SpeciesKey, SpeciesDef>` over a private `REGISTRY` literal:
the keys stay exact, but a lookup is one `SpeciesDef` rather than a 23-arm
union nothing can read a field off.

### Bugs found

- **Every quadruped's lower jaw has been invisible, in every pose, since the
  archetype was written.** Seventeen call sites open a jaw with one angle —
  `S('jaw', 0.5 * k)` — against `poseBone(rig, name, x, y, z)`, so `y` and `z`
  arrived as `undefined`. `Euler.set` stores them, `Quaternion.setFromEuler`
  runs `cos(undefined / 2)`, and the whole quaternion comes out `NaN`; a bone
  with a `NaN` matrix skins its vertices to `NaN` and the GPU discards every
  triangle bound to it. Nothing else is bound to `jaw`, so nothing errored and
  nothing else broke. **Measured in the page, both ways**: with the old
  signature the sabertusk/coeurl/garula/dualhorn/voretooth jaw quaternion reads
  `[null,null,null,null]` (NaN); with `y = 0, z = 0` it reads
  `[0.025, 0, 0, 0.99969]` — the 0.05 rad the idle pose asks for. Fixed, because
  a `NaN` quaternion is not a behaviour anyone chose. `creaturecheck` stayed
  207/207 across the change. **This wants a look by eye**: five muzzles have
  just grown a lower jaw, and the corpus shots of them are all stale.
- **`Enemy.knockbackCap` is never assigned by anything.** `hit()` read
  `this.knockbackCap ?? 3.6`, so 3.6 is the only value it has ever had. Now the
  constant `KNOCKBACK_CAP`, which says so.
- **`type.defense` / `type.magicDefense` are declared by no species.**
  `Enemy.defense` added `(this.type.defense || 0)` to a level-derived number —
  always zero. Removed rather than declared: a per-species mitigation knob
  nobody has used is a knob to add when it is wanted.
- **No attack declares `approachDuring`.** `_tickTelegraph` had a branch that
  closed the distance through a wind-up behind it; it has never run. Removed.
- **`_sense` skipped a threat on `c.downed || c.ko`.** `downed` is real —
  `Downed.ts` sets it on the player. **`ko` is not**: a companion's KO flag is
  `m.stats.ko`, and nothing has ever written `.ko` on a threat. Dead arm
  removed; enemies keep targeting a KO'd companion exactly as before.
- **`freeze('pounce')` poses nothing.** `Director.ts` and `creaturecheck` both
  name `pounce` as a pose, and **no species' `pose()` has a case for it** — it
  falls to `default:` and comes out as `idle`. `Director._lungeShot` lifts the
  sabertusk 1.15 m and freezes it "mid-pounce"; what is actually in that frame
  is a standing animal in the air. Left alone: writing a pounce pose is art
  direction, not typing. `PoseName` lists it so the next reader can see it.
- **`ANAK.passive` / `ANAK.skittish` are read by nothing.** Documented in the
  source as "hints for the encounter code"; the encounter code does not look.
  Declared optional on `SpeciesDef` with the note, not deleted — the design
  intent is worth more than the two lines.
- **`EnemyAttack.backward`** (the anak's kick) is likewise authored and unread.

### Changed outside `src/characters/enemies/`

- `dev/AssetBrowser.ts` — one line: `pose` is a `string` off the family table
  and `freeze` now takes a `PoseName`, so the call is guarded with
  `isPoseName(pose)`. Every string in `ENEMY_POSES` passes it; behaviour is
  identical.

### Still open here

- `Enemy.reset()` does not clear `analysed`, `_waited`, `status` or `airborne`,
  so a pooled instance inherits them. Recorded, not changed.
- The five quadruped sculpts still carry their own two-scratch-register `mix`
  / `blend` helpers rather than `Palette.mixc`, which exists precisely because
  two registers cannot survive a nested blend. Typed, not migrated.

## `src/game/**` — 450 → 124, and the scene contract is written down

`cinematics/`, `story/`, `encounters/`, `interaction/` and the top-level
`Game.ts` / `Director.ts` / `CameraRig.ts` / `Shots.ts`. **Zero left** in
`cinematics/CameraMove.ts`, `Stage.ts`, `Timeline.ts`, `RoadPath.ts`,
`Cinematics.ts`, every `story/scenes/*.ts` including `SceneKit.ts`,
`story/StorySystem.ts`, `story/Triggers.ts`, `encounters/EncounterDirector.ts`,
`encounters/Pack.ts`, `encounters/SpawnTables.ts`, `rpg/Quests.ts`,
`rpg/Inventory.ts`, `rpg/RpgSystem.ts`, `rpg/PartyState.ts`, `rpg/Elemancy.ts`,
`rpg/DayCycle.ts`, `rpg/Emitter.ts` and `Director.ts`.

Both typechecks clean repo-wide; `src/tools/integration.mts` 18/18 before and
after.

### The headline: `src/game/cinematics/Scene.ts` (new file)

`SceneKit` had `ctx: any` in twelve signatures and every scene had it four more
times. It is one contract and it is now one file:

| name | what it is |
|---|---|
| `SceneCtx<D>` | what a scene is handed — `game`, `stage`, `cine`, the six systems looked up once at `play()` time (each `T \| undefined`, which is honest: a capture can drive a scene on a partial world), `box`, `Frame` and `data`. |
| `SceneData` / `SceneCtx<D>` | the scratchpad is **generic**, defaulting to the base. `Opening.ts` declares `OpeningData` and takes `SceneCtx<OpeningData>`, so one scene cannot read a field another scene invented. |
| `SceneDef<D>` | the authored cutscene: `stage`, `buildShots`, `cues`, `tick`, `onStart`, `onEnd`. |
| `StageFrame` | the interface `Frame` **and** `RoadPath` both implement (`implements StageFrame` on both). `yawAt?` is optional because only `RoadPath` has one — `F.yawAt ? F.yawAt(f) : F.yaw` in `Opening` is a real dual-shape, not a name guess. |
| `ShotDef`, `ShotKey`, `Cue<D>`, `LiveCue<D>`, `CarHold`, `ActorId`, `PoseName`, `EaseName`, `SceneResult` | the rest of the vocabulary. `Cue.music` is a real `MusicStateName`; `Cue.fade.colour` and `chapter.kind` are the literal unions `Letterbox` already declared. |
| `CarHold` | `{ sim: Object3D, simVisible: boolean } \| { sim: null, simVisible: null }` — `releaseCar` reads `simVisible` only inside `if (s.sim)`, and now the type says why. |

`Stage.ts` gained `StagedActor` and `LookTarget`; `actor()`/`place()`/`pose()`/
`look()` take `ActorId` and `PoseName`, so `stage.pose('gladio', 'pushh')` is a
compile error. `SceneKit`'s option bags are named (`FrameOpts`, `ArrangeOpts`,
`SingleOpts`, `WideOpts`, `TwoShotOpts`, `OtsOpts`) and `frameAt` takes the
`SiteType` union `world/props/EcoSites.ts` already published, so a scene cannot
anchor on a site type the Ecology does not lay down.

### Authored vs resolved, everywhere it mattered

| authored | resolved | file |
|---|---|---|
| `AuthoredItem` | `ItemDef` | `Inventory.ts` — the per-category tables vs the one `ITEMS` lookup. Category fields stay optional on the resolved shape *because a lookup by id does not yet know the category*; that is what `def.category === 'weapon'` tests. |
| `Objective`, `Quest`, `QuestRewards` | `ObjectiveState`, `QuestState`, `ObjectiveView`, `QuestView`, `GrantedRewards` | `Quests.ts`. `Quest` lost its `[extra: string]: any` and now declares all seventeen real fields. |
| `TerritorySpec` | `Territory` | `SpawnTables.ts` — `T()` fills five defaults, so nothing downstream guesses what a missing `respawn` means. |
| `RewardBundle` | `GrantedRewards` | `RpgSystem.grantRewards` takes the partial (a chest gives gil and items); `QuestLog.rewardsFor` produces the filled-in one. |
| `BuffSpec`, `Recipe` | `Buff` | `PartyState.ts`. |
| `SpellDef` | `CarriedSpell` | `Elemancy.ts` — `uid` and `remaining` exist only once a flask is in the bag, so `craft()` builds a new object rather than mutating the rolled one. |

### Discriminated unions replacing `{ ok: boolean, … }`

`Inventory`: `BuyResult`, `SellResult`, `EquipResult`, `UseResult`.
`Quests`: `AcceptResult`. `DayCycle`: `RestResult` (`RestSummary` /
`RestRefused`), `CampCheck`. `Elemancy`: `DrawResult`, `CastResult`.
`PartyState`: `CookCheck`, `CookResult`. `RpgSystem`: `CampResult`.

`buy()` had no return annotation at all, so `ok` widened to `boolean` and
`cost` was missing from one arm. **`src/ui/screens/ShopScreen.ts:258`'s
`'cost' in res ? res.cost ?? 0 : 0` workaround can go** — `if (res.ok)` narrows
now. (It still compiles as written, so it is a cleanup, not a break.)

### Bugs found

- **`EncounterDirector._playerAvoids` calls `c._perfectParry(e)` with one
  argument.** `CombatSystem._perfectParry(enemy, p)` dereferences `p` on its
  first line (`p.position.clone()`), so **every phase-parry that came through
  the encounter loop threw a TypeError out of the frame** — and the encounter
  loop owns `Enemies.onStrike`, so it is *the* strike path. Fixed by passing
  the player, which is the only reading of that call that is not a crash. The
  correct two-argument call already exists in `CombatSystem`'s own strike path,
  which is why nobody noticed.
- **`Sky.timeOfDay` does not exist** (`Sky.hours` does). `EncounterDirector.pressure()`'s
  no-RPG fallback read it, so that branch resolved to noon and could never
  report a night. Corrected to `hours`. Same family as the five sites in
  LANDMINES §"Names nothing ever verified".
- **`Character.hitReact` is defined nowhere in the tree.** `damageThreat` called
  `member.character?.hitReact?.(0.8)`, so a companion's hit reaction has been a
  no-op since it was written. Dead arm removed.
- **`EncounterDirector.huntRuntime` is written once and read nowhere.**
  `Director.init` set it; `HuntRuntime` drives itself off `quest-updated` and
  holds its own `dir`. Removed.
- **`Cinematics.external`** — declared, set to `null`, documented as "set true
  by the title screen"; nothing reads or writes it. Removed.
- **`EncounterDirector._hits`** — declared, set to `[]`, never read. Removed.
- **`e.roamer = true`** in `spawnRoamer` — written once, read nowhere. Removed.
- **`SET_PIECES[*].music`** is `'boss-field'` / `'boss-imperial'` / `'boss-astral'`,
  **none of which is a `MusicStateName`**, and the only consumer is the
  `encounter:boss` event detail — **which nothing listens for**. Typed as the
  three literals with a note; not re-pointed at `'boss'`, because that is a
  behaviour change a typing pass does not get to make.
- **`Quest.requiresFlags` is honoured by `refresh()` and set by no quest.** So
  `setFlag('astral-called')` (the Astral scene's `onEnd`) and every reward
  `unlocks` currently gate nothing. Declared with the note; the hook is real.
- **`StorySystem.applyShot`'s `String.prototype.at` trap is now structurally
  impossible**, not just commented: the object arm is narrowed into its own
  binding at the top, so no field can be read off the `'title'` string form.
- **`Emitter`'s class doc says "no wildcards"; there is a `'*'` handler path.**
  Left in, comment corrected.

### Notes for whoever picks this up

- `src/ui/screens/QuestScreen.ts:168` needs one word: `byStatus` now takes
  `QuestStatus`, and its local `const TABS = [...]` infers `status: string`.
  `as const` on `TABS` fixes it. That is the only out-of-scope break this wave
  caused, and it is in `src/ui/`, which another agent owns.
- Remaining in `src/game/`, worst first: `encounters/Downed.ts` 14,
  `rpg/CombatBridge.ts` 13, `rpg/Ascension.ts` 12, `encounters/BossFight.ts` 11,
  `interaction/Dialogue.ts` 11, `rpg/SaveGame.ts` 11, `story/TitleScreen.ts` 10,
  `encounters/HuntRuntime.ts` 8. None needs new design work — they are
  `x!: any` fields and DOM/option bags of the kind the mechanical pass could
  not agree on.
- `RpgSystem.on/once/emit` are generic over the payload (`on<P>(event, fn)`),
  not over a typed event map. A `RpgEvents` map in the shape of
  `combat/CombatEvents.ts` is the right next step and would type `HudBridge`,
  `AudioSystem` and `StorySystem`'s handlers from one place.
