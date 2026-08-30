# Lane 22 — Chocobos (plan items 70, 71)

Status: **task 70 landed and verified by eye; task 71 not started.**
Lifetime 1 of an expected 3–4. Written so a fresh agent can continue without me.

## Where to pick this up (the exact next step)

**Build `src/game/chocobo/ChocoboHub.ts`.** Everything the mount needs exists
and works; task 71 — the two posts becoming hubs — is entirely untouched. Order:
colours first (the rig already builds any of six dyes), then sylkis feed tiers,
then `Races.ts`. The `side_chocobo` re-key is last and is now cleanup, not a
rescue (see *Cross-boundary*).

## Ownership carve-out I was given, and kept

The plan says this lane owns `src/game/chocobo/` and `src/characters/`.
**`src/characters/` is not free** — lane 1 is live in `src/characters/rig/` and
lane 2 takes the rest. So the bird lives entirely in **new** files:

- `src/characters/chocobo/` — `ChocoboRig.ts` (art), `ChocoboAnim.ts`.
- `src/game/chocobo/` — `ChocoboSystem.ts`, `ChocoboBody.ts`, `Saddle.ts`.
- `src/tools/probes/` — `chocobostage.mts`, `chocobodiag.mts`, `chocobodiag2.mts`,
  `skinweightblast.mts`.

Touched outside that, one concern per commit, explicit pathspec each time:
`src/game/Game.ts` (one import, one `SystemRegistry` key, one `step()` line),
`src/game/rpg/RpgSystem.ts` (one `STARTING_ITEMS` row),
`src/characters/rig/Sculpt.ts` (a cross-lane regression fix — see below).

**Still not mine:** `src/game/Shots.ts` (lane 3 then 21), everything else under
`src/characters/`.

## Done, and *verified by eye on a frame* unless marked otherwise

- **The rig.** `buildChocoboPrototype(colours)` — one merged `SkinnedMesh`,
  31 bones, ~6.9 k vertices, **one draw call**. Six dyes declared.
  **Verified**: standing side/front-¾/head/feet/far/rear-¾ at 2.3 m; it is a
  yellow bird with a blunt orange beak, a bridle, a layered feathered barrel,
  an upswept nine-feather tail fan, scaled tarsi and three-toed clawed feet.
  The eye has an orb, iris, pupil and catchlight and reads as alive at 0.6 m.
- **The animator.** Two-beat biped gait, body rising twice per stride, neck
  cancelling the barrel's heave so the skull stays level, crest/tail/wings
  lagging by a phase offset. **Verified** at speed: legs in a real bird gait,
  one folded and forward, one extended back.
- **Summon → mount → ride.** `Digit6` whistles; the bird spawns 22 m out,
  runs in, registers a `Ride` interactable on arrival; `E` mounts; `Digit6`
  dismounts. **Verified**: probe reports `mount: true` and the ride covered
  53 m of real terrain.
- **11.00 m/s, measured**, sustained over 3.3 s of held input — exactly
  `WorldMap.SPEED.chocobo` (`WorldMap.ts`:1170), so the world map's ETA table
  now tells the truth. Walk 5.5, sprint 15.0 on 6 s of stamina.
- **The flock.** Three cloned birds for the retinue, one draw each,
  follow-spring only (no capsule, no controller). **Verified** in the rear-¾
  ridden frame only insofar as Noctis is astride; *the companions' own birds
  are NOT yet verified in a frame.*
- **The whistle is in the starting bag** (`RpgSystem.STARTING_ITEMS`). No
  unlock gate, per the plan.
- **`orphans` is green** — `317 modules, 317 reachable, no orphaned modules`,
  since `13b7ff8`. (Lane 1's red report predates that commit.)

## Not done

- **All of task 71.** No hub, no colour purchase, no sylkis feed tiers, no
  races, no `side_chocobo` re-key, no `NpcDialogue` rows, no Alpine Stable
  re-type, no `ControlsScreen` group.
- **The draw-cost measurement is a recorded NEGATIVE, not a number.**
  `probes/chocobodraws.mts` A/B/A-toggles the four birds' roots on a settled,
  converged, ridden page. Its two *control* arms — the same scene, birds
  hidden, four frames apart — read **589 and 489 draw calls**, a drift of 100,
  against a "present" arm of 397 twice. That yields a cost of **minus 142
  calls for four birds**, which is not a result: the scene is still resolving
  streaming/LOD/vegetation on the frames it samples, and four frames after a
  toggle is a transient (`LANDMINES`, "toggling one post pass and settling
  four frames is not an ablation"). **Quote no draw cost for the mount.** The
  probe now refuses to print one when the control drift swamps the delta. Fix
  it with 30+ settle frames, several repeats with the spread reported, and a
  null ablation as the noise floor — then measure.
- **No other perf number has been taken.** `npcdraws`, `drawcheck` and `--perf` with
  the bird in frame are all still owed. **Do not certify on a number taken
  before the daemon restart** — the coordinator says 62% of harness time
  tonight was queue and both bake caches were cold; none of those is a
  baseline. Take it behind `daemon.mts --wait exclusive-free` and say whether
  the tree was quiet.
- Mount legality is **coded but not exercised**: `canStandAt()` refuses
  `normal.y < WALKABLE_Y` (50°) and anything below `Water.level + 0.35`.
  Nobody has stood the bird on a 55° slope or at a lake edge and watched it
  refuse. That is a probe, not an argument.

## Known defects, ranked

1. **The rump shows dark gaps between the flank shingles** where they lift off
   the barrel — visible in the ridden rear-¾. Either drop the shingle `pitch`
   on the outer rows or overlap the rings more.
2. **The rider's left arm reads as flung out** rather than closed on the rein,
   in the rear-¾ at speed. `POSE_RIDE.upperArmL` may be losing to the animator,
   or the `post` term on the upper arms is too large.
3. The breast down still reads as one smooth pale mass; it wants a few down
   feathers over it.

## The landmine this lane found, and what it cost

`75d8768` (00:03, plan task 38) changed `mergeCreature`'s `skinWeight` row from
`Float32Array` to `Uint8Array`, under a comment claiming the row was
unreachable. It is reached by **every creature in the bestiary**:
`RigBuilder.attach/attachBlend/attachChain` write `Float32BufferAttribute` skin
weights and `Rig.build` calls straight into `mergeCreature`.
`arr.set(float32Src, off)` into a `Uint8Array` truncates — a rigid weight of
1.0 survives, a blended 0.98/0.02 becomes 0/0, and a vertex whose weights sum
to zero skins to the mesh origin.

Measured with `src/tools/probes/skinweightblast.mts`: **23 of 23 species,
16,234 of 276,524 vertices (5.9%)** collapsing to the origin — anak 27.9%,
mt 28.9%, coeurl 24.3%, dualhorn 22.3%, sabertusk 17.9%. Reverted in
**`ce162a3`**; the coordinator reports `creaturecheck` green again at 207
poses / 0 failures.

**How it was found is the reusable part**: the first capture showed a fan of
black triangles converging on a point at the bird's feet, with the head, beak,
eyes and toes rendering perfectly. That split — rigid parts fine, blended parts
gone — is the fingerprint. `chocobodiag2.mts` is the three-stage ablation
(attachChain 0 bad → attach 0 bad → merge 34 of 237 bad) and the line that
ended it was `sw.array.constructor.name === 'Uint8Array'`.

## Corrected anchors (the cold-start brief's were partly stale)

| brief said | actually |
|---|---|
| `src/characters/rig/RigBuilder.ts` | `src/characters/enemies/RigBuilder.ts` |
| `src/characters/enemies/CreatureAnim.ts` | `src/characters/rig/CreatureAnim.ts` |
| `src/game/Player.ts` | `src/characters/Player.ts` |
| "`KeyY` is free" | **`KeyY` is `RegaliaSystem.KEY.camera`** (`RegaliaSystem.ts`:91) |

Free key codes, re-grepped: `Digit6`–`Digit0` only. `Digit1`–`Digit4` are
combat weapon slots and `Digit5` is the firearm (`CombatSystem.ts`:1514-1515).
This lane took **`Digit6`**.

Other verified anchors: per-vertex surface response is **`aMat`**
(`Sculpt.ts`:504), not GeoKit's `aSurf` — an `aSurf` part is silently dropped
at the merge. `Occupants.exit` early-returns on a null `_saved`, so `Saddle.exit`
clears `seated` *before* its guard or a spurious dismount strands the player at
`NO_GROUND`. `Ascension.awardAp('chocobo-distance', metres)` is gated on the
`ap-chocobo` flag from `exp_choco1`.

## Cross-boundary

- **`Quests.ts` is RELEASED** (lane 17, `ff695f8`). Chapter 3 is un-soft-locked
  and the POI `gate:` field is deleted repo-wide, so `side_chocobo` must be
  re-keyed **to quest state, not to a chapter gate**. Cleanup, not a rescue.
- **FOR LANE 1 / whoever re-attempts task 38:** if a Uint8 skin-weight format
  is wanted for memory it needs the weights *scaled by 255* on the way in and
  `new BufferAttribute(arr, size, true)` on the way out. An unnormalised Uint8
  attribute reads 0..255 raw in the shader and is wrong in the other direction.
  That is written into `Sculpt.ts` beside the row now.
- **FOR LANE 10 (`ControlsScreen.ts`):** this lane needs a **Chocobo** group —
  `6` whistle/dismiss, `E` ride, `Shift` sprint. Not landed, because the card
  already lies about several rows and lane 10 owns fixing them; land the group
  on the corrected card rather than on top of the wrong one.

## Shots lane 21 should author for the corpus

Written down because this lane cannot touch `Shots.ts`. All are `follow:` on
the player so the rig re-anchors every frame (absolute framings drift):

1. `chocobo_ride` — follow, offset ~`[0, 2.6, -6.4]`, lookOffset `[0, 1.4, 6]`,
   ridden at 11 m/s across open Duscae. The money shot: rider astride, plume
   streaming, four birds in formation.
2. `chocobo_summon` — the bird's 22 m run-in, framed from behind the player at
   eye height, so the arrival reads as an animal and not a menu.
3. `chocobo_post` — Wiz Chocobo Post with birds in the paddock (needs task 71).
4. `chocobo_portrait` — a near framing at ~2.5 m, ¾ front, to carry the eye,
   the crest and the tack. The head sits **0.62 m forward of the root**; a
   framing aimed at the root's own xz at head height photographs the shoulder.

## Instruments this lane built

- `probes/chocobostage.mts` — six framings of the mount.
  `--set __MODE=stand|ride|gallop`, `--set __COLOUR=<key>`. The gallop mode
  drives the bird by wrapping `Input.update`; replacing `input.move` throws,
  because `Input.update` calls `this.move.set()` every frame.
- `probes/chocobodiag.mts` — weights, bind-pose CPU skinning, cloned skeleton.
- `probes/chocobodiag2.mts` — the attachChain / attach / merge ablation.
- `probes/skinweightblast.mts` — per-species collapsed-vertex census. Keep it;
  it is the regression test for the landmine above.

## Commits

`13b7ff8` the mount · `ce162a3` the cross-lane skinWeight revert ·
`5070a7f` the art pass from looking at frames · `9c35b9f` the starting whistle.
