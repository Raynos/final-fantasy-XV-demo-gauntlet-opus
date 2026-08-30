# Lane 22 — Chocobos (cold-start brief)

Owns (new, all yours): `src/game/chocobo/` — `ChocoboSystem.ts` (whistle
key, summon, mount/dismount, prompt), `ChocoboRig.ts` (RigBuilder bird +
prototype, colour variants), `ChocoboBody.ts` (own CharacterController +
wish-velocity move), `ChocoboAnim.ts` (idle/trot/gallop from
Mesmenir.pose), `Saddle.ts` (Occupants analogue), `ChocoboHub.ts` (Wiz/
Alpine interactables), `Races.ts` (3 courses), `probes/chocoboride.mts`.

Minimal touches, each its own explicit-pathspec commit: `Game.ts` (one
SystemRegistry key + one step() line after Regalia :290);
`RpgSystem.ts:111-119` (+`['chocobo_whistle', 1]` to STARTING_ITEMS);
`Quests.ts:573` (side_chocobo re-key off ch3-deadeye);
`ControlsScreen.ts:12` (a Chocobo group — see landmine on the stale
rows); `NpcDialogue.ts:463` (Wiz hub rows); `WorldMap.ts:611`
(meldacio_layby "Alpine Stable" parking → type chocobo). Do NOT touch
Shots.ts, Player.ts, CharacterController.ts (lane 23 owns it).

## Anchors per task

**Rig.** RigBuilder.ts: Rig :26, bone() :47, attach() :76, attachBlend
:96, attachChain :135, build() :178, poseBone :323, creatureMaterial
:352. **The whole creature is ONE SkinnedMesh** (EnemyPrototype.mesh,
EnemyBase.ts:262; cloneSkinned :757) — the perf argument for this path.
**Closest template: Mesmenir.ts** — a horse with a real gallop: GALLOP
offsets :313, gallop(ph, reach) :334, run/approach with bounce+pitch
:365-378. Bone naming fsh/fkn/ffl/fho, bhp/bst/bhk/bho, spine/chest/
neck1/neck2/head. Chocobo is bipedal: keep the hind chain, drop the fore
pair, add wing L/R + crest; retime GALLOP to a two-beat hop (bR 0, bL π)
with suspension. CreatureAnim.ts: GAITS :57, stride() :319, pickGait
:326. Anak.ts:114-133 is the cleanest bone table to read.

**Locomotion.** Player.ts:115-116 run 7.4 / walk 3.6; selection :201;
update :173; collide+snap :214-219; gait feed :227. CharacterController
move() :88, slope :93-105, WALKABLE_Y = cos 50° (CollisionWorld.ts:26).
**The 50° mount rule already exists** — refusal = normal.y < WALKABLE_Y.
Regalia pattern: KEY.enter :57, enter() :307, exit() :322, prompt+toggle
:588-603. Occupants.ts: enter :246, the neutralisation (p.terrain =
NO_GROUND, party.speedMul = 0, :262-275), exit :279, update writes
root pos/quat from the seat anchor :320-338, _applyPose :342.

**Camera.** CameraRig follows player.position directly (:472-476), FOV
kick at speed > 5.2 (:518-520). **No changes needed** if the player root
rides the saddle — only maybe raise restDistance/height while mounted.

**Whistle + key.** Inventory.ts:257 chocobo_whistle (KEY_ITEMS, no use
handler); sylkis_greens :206 (600 gil, sold :851). Granted only by
side_chocobo's reward (Quests.ts:586) — hence STARTING_ITEMS. **Free key
codes (grepped every key()/keyDown() site): KeyY, Digit6–Digit0.** Take
KeyY = toggle summon/dismount; mount itself via
`Interaction.register({verb:'Ride', …})` so it gets the standard prompt.
Ascension hooks EXIST: 'chocobo-distance' 1 AP/400 m (:155),
exp_choco1/2 (ap-chocobo, chocoboStamina +50%, :324-325), accumulator
:417/:446-450.

**Hubs + races.** POIs: wiz_chocobo (WorldMap.ts:473, at n_wiz),
wiz_paddocks (:475, "the training rings and the race circuit"). Kit
geometry exists (PoiKits.ts:1961 _chocobo: paddock/barn/silo/trough/
signboard). Wiz: cast NpcCast.ts:435, placement Npcs.ts:221, dialogue
NpcDialogue.ts:463-505 (a hub([...]) menu — add rows). Races: Triggers
add() :105 (kinds place|region|hour|quest|combat, once default true),
clear(tag) :111, notify :221 — checkpoints do NOT need PLACES entries:
radius-test in Races.ts, keep Triggers for start/finish. Timer: none
generic; Fishing's _t accumulator (:81) is the shape, ~20 lines.
Markers: `Minimap.waypoint` (Minimap.ts:77) — **nothing assigns it
today; it is a free write target**; CompassBar reads GameData.readMarkers
(:642). Colour variants: Cast.ts-shaped record; blend with `mixc` from
enemies/Palette.ts (the naive two-scratch mix renders parts black).

**Perf.** Budget 800/shot; worst town_forecourt 821 recorded; the four
party rigs cost ~34 draws each (Character = many meshes). **One
RigBuilder creature ≈ 3–5 draws** — the bird is ~1/8th of a party member.
Instruments: probes/npcdraws.mts, _probe/drawattrib.mts, drawcheck gate.

## Architecture (decided): attach the player to a chocobo entity
(Regalia/Occupants pattern) with a CharacterController, NOT VehicleBody,
NOT a re-skinned player controller. ChocoboBody owns
`new CharacterController(collision, {radius .55, height 2.1, stepUp .55,
stepDown .7})`, reproduces Player.update:178-226 (camera-relative wish →
heading → damp → body.move) with run 11.0 / walk 5.5 / sprint burst ~15
on stamina scaled by ascension.value('chocoboStamina').
ChocoboSystem.lateUpdate writes player.root onto the saddle anchor as
Occupants.update:325-338 does, reusing the NO_GROUND neutralisation.
Why: the rider must be drawn anyway (_applyPose's job); Player.ts stays
untouched; CameraRig/lock-on/minimap keep working because
player.position stays truthful; dismount is already solved
(Occupants.exit). Mount legality: refuse if normal.y < WALKABLE_Y or
`terrain.heightAt < water.level` at the target. Summon: spawn 18–25 m
out, run in, register Ride only on arrival.

## Commands
```
pnpm run typecheck
node src/tools/check.mts --only integration,uxcheck,creaturecheck
node src/tools/probe.mts src/tools/probes/chocoboride.mts --ttl 20
node src/tools/probe.mts src/tools/probes/npcdraws.mts --set __SHOT__=poi_chocobo
node src/tools/check.mts --perf
node src/tools/gitlock.mts commit -m "…" -- src/game/chocobo
```

## First commits
1. ChocoboRig.ts — bone table + build; probe prints skeleton size + draw
   delta.
2. ChocoboAnim.ts — idle/trot/gallop from Mesmenir.pose:334-378.
3. ChocoboBody.ts — headless, probe-driven.
4. ChocoboSystem + Saddle + the Game.ts one-liner — summon on KeyY, Ride
   prompt, mount/dismount. **The task-70 bar.** npcdraws reading here.
5. ControlsScreen group + STARTING_ITEMS (separate pathspec commits).
6. ChocoboHub — Wiz interactables + dialogue rows; colours, then sylkis
   tiers.
7. Races.ts — one course end-to-end, then the other two.

## Landmines
- **ControlsScreen already lies** (X/Y/6-8 rows vs actual R/V/Z-X-B) —
  lane 10 owns fixing those; coordinate so your Chocobo group lands on
  the corrected card, or fix in the same commit if lane 10 hasn't.
- **E is contested**: CombatSystem._interactClaimsE (:1512,:1522) — a
  Ride interactable is fine; a raw keyDown('KeyE') is not.
- **Player.update keeps running while mounted** — Saddle.update must run
  in lateUpdate after CameraRig or the rider snaps a frame behind.
- **converge()**: any exponential damp (speed/gait/stamina) needs a
  converge() or shoot.mts gets non-deterministic draw counts.
- Palette.mixc, not a local mix (four species rendered black from nested
  two-scratch blends).
- drawcheck --set-baseline on a subset DELETES unmeasured entries.
- EnemyBase runs _groundCal (:958) — a rig outside Enemy doesn't get it;
  hand-tune saddle/foot Y or lift the calibration.
- Occupants.exit early-returns if _saved is null — a dismount that never
  entered strands the player at NO_GROUND. Guard.
- side_chocobo's escort verb is deliberately cut — do not resurrect a
  follower system.
- Alpine Stable re-type changes the world-map filter set
  (WorldMapScreen.ts:55/87) — check both.

## Done-when
Whistle in the starting bag; KeyY at spawn summons, E mounts, KeyY
dismounts — flat, 40° OK, refused at 55°, refused over water; sustained
11.0 m/s over 30 s matching WorldMap.travel()'s SPEED.chocobo
(WorldMap.ts:1145) so the map ETA is true; camera follows with zero
CameraRig edits; Wiz + Alpine offer colours, sylkis tiers, and a race
board; side_chocobo accepts without ch3; one race completable end-to-end
by chocoboride.mts paying gil + AP; typecheck + check green; --perf 60
fps with the bird in frame; npcdraws ≤5 colour draws for the mount, no
shot over 800.
