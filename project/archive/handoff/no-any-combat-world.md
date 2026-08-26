# `src/combat/**` and `src/world/**` — zero `any`

**Status: done.** 599 → **0**. Both typechecks clean repo-wide, `combatloop.mts`
30/30, `roadcheck.mts` 0 failures / 0 warnings. Nothing committed.

    node src/tools/anycheck.mts --by-file | grep -E "src/(combat|world)/"   # empty

## The one behaviour change, and it makes a noise

**`combat:armigerHit` now has an emitter.** `AudioSystem` has always subscribed
to it through a raw `window.addEventListener`, because `CombatEvents` did not
know the name — so `Sfx.armigerHit` had only ever been heard in the offline
audio render. It is now in `CombatEvents`, in `globals.d.ts`'s `WindowEventMap`,
and `CombatSystem._tickArmigerStrikes` emits it with the strike position.

**That means a sound starts playing that never has**: on the same 0.28 s beat as
the phantom-arm strike, so up to ~28 plays across an 8 s Armiger. `combatloop`'s
two Armiger checks still pass. Nobody has *listened* to it. If it is too dense,
the beat is `this._armigerBeat = 0.28` in `_tickArmigerStrikes` and the emit is
three lines below it.

Two smaller ones, both unobservable:

- `_applyDamage` passed `killer: 'noctis'` — a string, into `Enemy.killer`,
  which the enemies agent typed `Threat | null` this session. **Nothing in the
  tree reads `killer`.** It now passes `this.player`, which is what the string
  meant.
- `Field._crater` destructured `core` with no default. Only the Disc of
  Cauthess declares one, so any *other* crater would have multiplied `undefined`
  into the height and written **NaN across the whole crater floor**. `core = 0`
  now. Latent, never hit, because there is only one crater.

## Names nothing ever verified — found by typing the receiver

| the guess | what is actually true |
|---|---|
| `DevSuite`: `poi.id \|\| poi.poi?.id` | `nearestPOI` answers `{poi, dist}`. The first arm has never existed; its declared `id?: any` was the lie that hid it. |
| `Ecology.groundColor`: `t.groundColorAt() ?? t.colorAt()` | `Terrain.colorAt` has never existed on any Terrain. `Terrain.ts:431` already says so in prose; the dead arm was still in the code. Removed. |
| `Field.road` | declared on `Field`, written **only** by `FieldBake.applyBakedField`, read by nothing. `Terrain.road` comes from `roadSpline`. Declaration and write both removed. |
| `Field._b` | assigned `{}` in the constructor, read nowhere. Removed. |
| `CombatEvents.rested` | nothing emits it on the combat bus and nothing subscribes. `HudBridge`'s `rested` handler is on the **RPG** emitter, where `DayCycle` sends it. Left as `unknown` with a note rather than deleted. |
| `CombatEvents.draw` | `drawEnergy` emits it; no subscriber. `unknown`. |
| `RoadNetwork._makeSpine`'s `pointAt` / `distance` | "the interface the rest of the codebase has always used" — **called by nothing**. `RoadPath` re-implements the arc-length walk itself. Declared as `HighwaySpine` with the finding written down. |
| `CombatSystem._readInput`: `const pad = input.gpDown ? input : null` | `gpDown` is a method, always defined, so `pad` was always `input`. The real gating is `Input.gamepad` inside `gpButton`/`gpDown`. Removed. |
| `setLockOn`: `if (hud && hud.setLockOn)` | `HUD` declares `setLockOn`. Removed the second arm. |
| `Elemancy.defaultTarget`: `this.game.get && ...`, `terrain.heightAt && ...` | both are methods. What can be missing is the *system*, which is what the guards now test. |
| `resolve()`: `if (!rpg \|\| !rpg.damage)` | `RpgSystem.damage` is a method. |
| `CombatSystem.state`'s `hurt` | the comment listed seven states; nothing has ever assigned `hurt`. `CombatState` is the six real ones. |
| `enemy.status = {kind, until}` | written by `_applySpellEffects`, read by nothing — every status-effect flask is inert. The enemies agent found the same thing from the other side and declared it on `Enemy`; the write is left alone. |
| `tools/gameplay.mts:166`: `combat.castSpell('fire', at)` | `castSpell` takes a **slot index**. `'fire'` indexes `elemancy.equipped` and comes back undefined, so it returns `{ok:false,'empty-slot'}` — and because that is not null, the `??` fallback never fires either. **`gameplay.mts` has never cast a spell.** Out of scope (`src/tools/`), not fixed. |

## Contract drift that needs someone else

- **`Enemy.vulnerable` is undeclared.** `BossFight._tickBoss` writes it to open
  the boss vulnerability window; `CombatSystem.resolve` reads it for a ×1.5.
  It works only because both sides were `any`. Declared here as
  `CombatTarget extends Enemy { vulnerable?: boolean }` in `CombatSystem.ts` so
  the drift is written down in one place — **it belongs on `Enemy`.**
- **`Enemy.keepCorpse`** is the same shape (`BossFight` writes it); the enemies
  agent has since declared it.

## The interfaces, and where they live

**`src/combat/`** — `Weapons.ts`: `ComboStep`, `WeaponDef`, `WeaponTrailDef`,
`ArmigerSlot`, `ArmigerLayout`, `SteelMaps`; `WEAPONS` is
`Record<WeaponClass, WeaponDef>`. `CombatSystem.ts`: `CombatState`,
`ComboPhase`, `CombatListener`, `LockOnShim`, `WarpState`, `DamageRoll`,
`DamageBreakdown`, `HitOpts`, `CastOpts`, `CraftedSpell`, `SpellEffect`,
`CastResult`, `WeaponItem`, `WeaponSlot`, `CombatTarget`. `Elemancy.ts`:
`ElementDef`, `SpellReaction`, `ElementZone`, `CastReport`, `ElemancyCastOpts`.
`VFX.ts`: `TrackFn` plus one options interface per emit verb
(`SparkBurstOpts` … `LightningArcOpts`). `GroundFX.ts`: `PatchKind`,
`PatchUniforms`, `RingOpts`/`DecalOpts`/`PoolOpts`. `Trails.ts`, `Beams.ts`,
`ParticleSystem.ts`, `CrystalShards.ts`: a named uniform block and a spec type
each. `GeoKit.ts`: `LoftSection`, `CapOpts`.

**`src/world/`** — `map/WorldMap.ts`: `Region`, `Biome`, `Zone`, `PoiTypeName`,
`PoiType`, `ZoneWeights` (and `PoiSpec` lost its `[extra: string]: any`, the
landform tuning moved onto the kinds that use it). `map/RoadGraph.ts`:
`RoadClass`, `RoadClassName`, `NodeTable`, `RouteSpec`, `RoadSample`,
`RoadNode`, `RoadEdge`, `Route`, `RoadHit`. `map/MapDraw.ts`: `Project`,
`DrawBounds`, `DrawOpts`. `Terrain.ts`: **`Ground`** (see below), `TerrainStats`,
`LayerWeights`, `MaterialSample`. `terrain/TerrainMaterial.ts`:
`TerrainTextures`, `FieldConstants`, `TerrainUniforms`, `TerrainResources`.
`terrain/Road.ts`: `CarveTarget`, `HighwaySpine`. `terrain/Field.ts`:
`CtrlSample`, `Landmark`, `FieldStats`. `vehicle/`: `RoadPoint`, `SpinePoint`,
`RoadSpine`, `DriveControls`, `WheelState`, `SeatPose`, `Rider`, `OccupantCtx`,
`BanterCtx`, `NearLandmark`, `FuelStation`, `Destination`, `DrivePrompt`.
`collision/`: `GroundHit`, `CollisionStats`, `BoxProxy`. `Sky.ts`:
`SkyPreset`, **`AtmosphereUniforms`** (64 named uniforms, shared by the dome,
the cloud march, the god rays and every patched material). `Weather.ts`:
`WeatherPreset`. `veg/`: `VegBiomeSpec`/`VegBiome` (authored vs resolved),
`TreeSpec`/`BuiltTree`, `TreeBakeSource`, `VegWindOpts`, `ScatterPoint`, and a
placement + variant + tile record per scatter system.

## Out-of-scope edits, all minimal

1. **`src/characters/Player.ts`, `src/characters/Party.ts`** — `terrain` is now
   `Ground | undefined` instead of `Terrain | undefined`. `Occupants` swaps in a
   stub whose surface is a kilometre down while everyone is in the car (that is
   how the foot IK is turned off at 100 km/h), and both files only ever call
   `heightAt`. `Ground` is exported from `world/Terrain.ts` and `Terrain`
   implements it.
2. **`src/util/three-guards.ts`** — added `isLitMaterial`, the five-class check
   `MaterialPatch` and `Wetness` both walk the scene with.
3. **`src/characters/rig/CombatAnim.ts`** — one line: `poseSwing` returns 1 when
   `comboStep` is null. `lateUpdate` only calls it while a step is live, and 1 is
   the same neutral IK weight every other pose method returns, so it is a no-op.
   Needed because `comboStep` is `ComboStep | null` now.
   **`PHASE_KEY` can drop its `Record<string, …>` fallback**: `ComboPhase` is a
   closed union, so `Record<ComboPhase, 'wind'|'active'|'rec'>` is total and the
   `key ? step[key] : 0` in `swingCurve` can become `step[key]`.
4. **`src/audio/AudioSystem.ts`** — `_enemyMaterial` takes
   `Enemy | null | undefined`. `CombatEvents.hit.enemy` is genuinely optional:
   `tools/integration.mts:260` dispatches a synthetic `combat:hit` with no
   enemy, and `_speciesOf` one line below already accepts the absence.
5. **`src/world/props/Landmarks.ts`** — the `sign` arm asks for `roadZ`/`side`
   before calling `_sign(B, site: RoadsideSite)`. `Ecology.beside()` always
   writes both, but `EcoSite` cannot say so.
6. **`src/tools/roadcheck.mts`** — one `!` on `g.nodes.get(id)`, whose id came
   straight out of `deadEnds()` one line above.
7. **`src/dev/DevSuite.ts`** — the dead `poi.id` arm (see the table above).

## Two techniques worth stealing

- **`CombatSystem._listeners`.** A `Map` cannot correlate its key with its value
  type. `StoredListener` is written in *method* syntax
  (`{ call(d: CombatEvents[CombatEventName]): void }['call']`), which makes the
  parameter bivariant — so one `Set` holds every handler for an event, `on()`
  stays the typed door, and nothing is asserted at either end.
- **`LockOnShim`.** `Object.defineProperties` answers the plain function it was
  handed, which types away the accessors it just installed. `isLockOnShim` is a
  real type guard over `'target' in fn && …` rather than a cast: the throw under
  it is unreachable, and it is the one thing that would notice the shim
  breaking. The shim itself is untouched — but **the HUD already reads
  `lockTarget`** (`CombatHUD._updateReticle:454`, with the fix comment beside
  it), `CombatHUD.lockOn` is the HUD's *own* field, and the only external
  callers (`Director`, `Downed`, `gameplay.mts`) use `lockOn` as a verb. **No
  reader of the shim's accessors is left**, so the "delete this the moment the
  HUD reads `lockTarget`" note in `_installLockOnShim` is ready to act on.
