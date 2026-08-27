# WS-2 — does a fight read and play as a fight?

Phase 4's load-bearing finding is that encounters are **"currently a photo
booth"**, and it has never been closed. `combatloop` passing 31/31 does not
close it: that gate proves the mechanics are *reachable*, which is a different
claim from the fight having a shape.

**The finding is now measured rather than asserted, and the answer is no.**
Three defects are fixed; the largest one is outside this lane and is written up
below with the exact lines.

## The instrument

**`src/tools/probes/fightshape.mts`** (new). Walks the real player into real
wild dens with real input, plays three fights with a policy a person would
recognise — close, swing, dodge the telegraph, warp-strike the stagger, spend a
tech bar — and reports, per fight:

| number | why it is the number |
|---|---|
| `notice -> engaged` | the approach beat. Zero means the world has no approach |
| duration | FFXV's field encounters run 30-90 s |
| share of Noctis' max HP paid | a fight you cannot lose is a cutscene |
| enemy state occupancy | chasing is not fighting |
| attacks opened per second | the rhythm, if there is one |
| damage by source | whose fight is it |

```
node src/tools/probe.mts src/tools/probes/fightshape.mts --shot tmp/shots/x/f.jpg
```

**Run it against `HEAD`, not `--dirty`.** A probe that drives minutes of frames
holds one page for ten minutes, and on this shared trunk *any* agent's save to a
watched file makes vite navigate the page out from under it. That surfaces as
`page.evaluate: Execution context was destroyed, most likely because of a
navigation` and reads as a page crash. A `sha:` build is immutable and cannot do
it. (It also `breathe()`s every 300 frames — see below.)

## What the first run found

One voretooth den, midday, Longwythe, three of them:

```
notice -> engaged   0.2 s   `encounter:spotted` and `encounter:start` on the
                            SAME frame; awareness 0.00 -> 0.88 in one 0.22 s tick
duration            5.8 s
Noctis paid         0.8% of max HP — 40 of 4877, one hit in the whole fight
enemy time          64% chase, 13% telegraph, 9% attack
enemy attacks       3, across three enemies, in 5.8 s
```

Two more dens on the next run, a sabertusk x7 and a voretooth x8:

```
round 1   2 attacks in 5.4 s = 0.37/s   Noctis paid 0.7% of max HP
round 2   5 attacks in 7.7 s = 0.65/s   Noctis paid 0.0%
damage by gladio 48%  prompto 24%  ignis 14%  noctis 14%
```

Nought point nought per cent, and the player is a fifth wheel in his own fight.
The frames say the rest: at the frame the encounter starts, the pack is a
thirty-pixel smudge twenty-two metres out and the camera is framing a country
walk.

## Fixed, in this lane

1. **The rouse beat** (`Enemy._rouse`, `EnemyBase.ts`). A creature that
   acquires a target from a standing start holds `rouseTime` seconds (1.1 by
   default, `senses.rouse` per species) pinned in `alert`, facing you, not
   closing — and `inCombat` answers false for its duration, so
   `encounter:spotted` and `encounter:start` stop being the same frame. Being
   hit spends it, on the whole pack: an ambush must answer immediately.
   - The edge that arms it is `_hadTarget` **and nothing else**. `Pack.alert`
     writes `target` *and* `state = 'chase'` from inside another enemy's
     `_sense`, so any test involving "was in a calm state" armed the beat on
     exactly the one animal that saw you.
   - It has to **end in a charge**. Leaving that to `_sense` meant a packmate
     that had been told about you but could not see you decayed its awareness
     and dropped back to `patrol` — 18% of enemy-frames spent patrolling during
     a fight.
2. **The combat camera runs for the first time** (`CombatSystem._frameCombat`).
   `CameraRig` has carried a complete combat-framing block since it was written
   and **nothing ever called `rig.setLockOn`**, so it had never executed once.
   Fed from the live encounter rather than from `CombatSystem.setLockOn`,
   because `Director` calls `combat.lockOn(boss)` to pose the scenario shots and
   routing the camera through that call would move `combat_stagger` and its
   neighbours. It cannot fire under a capture: an authored shot holds `rig.shot`,
   and a posed page never reaches `EncounterDirector.state === 'combat'`.
3. **Flankers harry** (`EnemyBase._tryHarry`). The engage token gated *every*
   attack, so in a seven-strong den two animals fought and five orbited. A
   flanker in range and **behind** its target now opens its cheapest attack on
   its own long cooldown. Called from `chase` **and** `strafe`: the first version
   was in `strafe` alone and moved nothing, because a flanker whose target keeps
   moving spends 1-2% of its frames there. The ring is a place a pack member is
   *heading*, not a place it stands.

## Not fixed — the largest one, and it is not this lane's

**`Enemy.level` is decoration.** `EnemyBase` reads it for `defense`,
`magicDefense`, the EXP bucket and the nameplate, and **nothing scales HP or
damage by it**. A `level: 7` sabertusk (`SpawnTables.ts:160`) and a level 45 one
are byte-identical animals. `WildTerritories.ts:102` promises the opposite —
*"a coeurl in Leide is a level 22 coeurl and the same coeurl in Cleigne is a
level 45 coeurl, which is how the danger gradient survives being procedural"* —
and the gradient is cosmetic.

The curve is already in the bestiary and can be fitted from it: Anak (lv 9,
900 hp, 60 damage) through Red Giant (lv 50, 22 000 hp, 520 damage) is
**×1.085 per level for HP and ×1.058 for damage**, which makes the factor
exactly 1 at a species' own listed level and therefore free of the corpus and
the gates.

**Built and reverted**, because it cannot be done inside `src/characters/enemies/**`
alone. Two writers outside it defeat any version of it:

- `src/characters/Enemies.ts:171` — `if (o.hp) { e.maxHp = o.hp; e.hp = o.hp; }`
  overwrites a constructor-computed value on the **fresh-spawn** path while the
  pooled path goes through `reset()`. The first pack of each species would
  behave differently from every later one.
- `src/game/encounters/EncounterDirector.ts:438` —
  `e.maxHp = Math.round(e.maxHp * 3.2)` is a read-modify-write, so any read-time
  scaling is applied twice to every hunt mark.

The clean shape is for `Enemies.spawn` to hand the level to the constructor and
`reset()` and stop assigning raw `hp`/`damage` afterwards.

**And it is not enough on its own.** The dens a player of this demo actually
meets are **level 3-5** while Noctis is **level 27** (`Game.ts:224` boots
`startLevel: 27`; `WildTerritories.ts:246` takes the zone band, `[1, 8]` by
default). `RpgSystem.enemyScaling` is documented *"given the party's level"* and
is `nightScaling(hour, isDaemon)` — it has never read a party level. Applying
the curve without moving the bands makes the measured fights *weaker*, not
stronger. **Both halves, or neither.**

Also on the enemy side: `EncounterDirector.damageThreat` ends with
`dmg = Math.round(res.damage * 0.55)`, halving enemy damage again after
mitigation.

## Reported, outside this lane

- **The `STAGGER!` banner outlives the stagger** and is still on screen at the
  victory frame four seconds after the last enemy died. White letterspaced type
  with no plate over a bright sky is close to invisible — see
  `tmp/shots/ws2b/f-kill.jpg`. So are the damage numbers.
- **Nothing marks the end of a fight.** `encounter:victory` carries kills, EXP,
  gil and drops; the party simply stands up with weapons still drawn and the
  field HUD returns.
- **`CameraRig`'s combat framing is now live and under-tuned.** With `setLockOn`
  fed, `combatFraming = 0.6` biases yaw and pitch, but `restDistance` *grows*
  with target distance and `wantPitch = 0.16 + toTarget.y * 0.03` barely tilts
  down for a metre-tall beast, so a sabertusk at eight metres is still about
  sixty pixels. FFXV's combat camera comes in and down. Tune it with this probe.

## Open in this lane

- **The warp-strike shard burst reads as flat blue confetti at close range** —
  `tmp/shots/r1/f-victory.jpg`. Large opaque mid-blue lozenges, no emissive
  gradient, occluding the whole fight. `src/combat/VFX.ts` / `CrystalShards.ts`.
- **Warp-strike into a stagger is a ×10 overkill nuke** — measured 6787 damage
  on a 640 hp animal. Every kill in every fight had the same shape: stagger,
  `Q`, dead.
- **Noctis does 14% of the damage in his own fight.** `PartyAI.ROLES` motion
  values are the knob (Gladio 1.7 at a 1.7 s cadence), but this is a balance
  change that should not be made until the level bands above move, or it will
  simply be wrong again afterwards.
