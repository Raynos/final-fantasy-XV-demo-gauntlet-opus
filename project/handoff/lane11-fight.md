# Lane 11 — Fight shape

Plan items 33–36 of `docs/plans/2026-08-30-fable-to-nine.md`.
Exit: median den 18–30 s, Noctis pays ≥15% max HP, `combatloop` green (35/35
since lane 17), both perf gates certify.

Owns `src/combat/`, `src/game/encounters/`, `src/game/rpg/` **minus**
`SpawnTables.ts` (lane 18) and `Shops.ts` / `Npcs.ts` / `Quests.ts` (lane 19).

## Status

| # | item | state |
|---|---|---|
| 33 | `fightshape` computes a median | **landed** — `ed53de5`, `20405ce`, `fc05b7f`, `7041897` |
| 34 | `enemyScaling` implements its own doc | **landed** — `91cb6a5` |
| 35 | pack size / engage tokens | **landed** — `4a588f4` |
| 36 | warp throughput | **measured negative** — the plan's premise dissolved; `fc05b7f` |
| — | danger (incoming damage) | **landed** — `4a588f4` |
| — | `LEVEL_LIFT` 1.0 → 1.25 | **landed** — `7041897`, measuring |

## The instrument (task 33)

`src/tools/probes/fightshape.mts` printed three beat sheets and aggregated
nothing, so "a wild den runs 5.8–17 s" was three anecdotes drawn from a roster
whose `count` fields are *ranges* — a 3x spread you get for free.

- `--set rounds=N`, default **5**, eight headings authored (was a hard 3).
- an `AGGREGATE` block: every round's value beside the median, then a `VERDICT`
  against 18–30 s and ≥15% HP. Rounds that found no den, or killed nothing, are
  listed and excluded from the median.
- **a den is a `Pack`, not every hostile alive in the world.** The old count was
  `hostiles().length`, which is global: the first run reported `Sabertusk x7 …
  kills 3/7` for a den of three, with four more a hundred metres away.
- `ended:` — wiped / nobody-within-45 m / left-combat / timeout. A duration is
  not a duration until you know which.
- `hits taken` and **`% max HP per hit`**. "Noctis paid 1.5% over thirteen enemy
  attacks" and "5.1% over three" are the same headline describing opposite
  problems; per-hit cost separates them.
- warp **strikes** (`phase: 'start'`), lands and perches, kept apart from Q taps;
  and the **MP floor**, because MP fully regenerates before a fight is scored,
  so end-of-fight spend read 0 in every round.

Run it: `node src/tools/probe.mts src/tools/probes/fightshape.mts --set rounds=5`

## Baseline — **verified**, at `20405ce`, five rounds

```
duration      8.3 11.9 11.5 11.2  ->  MEDIAN 11.4 s        [target 18-30]
hp paid %     5.1 1.6 1.5 4.8     ->  MEDIAN  3.2 %        [target >=15]
party dps     977 764 478 520     ->  median 642 hp/s
noctis dmg %  30 29 26 38         ->  median 29 %
enemy atk/s   0.36 0.76 1.13 0.53 ->  median 0.65
VERDICT: duration FAIL (11.4 s); danger FAIL (3.2%)
```

Round 4 found no den (headings `[4.7, 2.0]` from where round 3 ended).

Supporting arithmetic — **verified** by `tmp/lane11-dmgmath.mts` at party 27:
Noctis has **4 877 max HP, 105 defence**. A level-28 sabertusk (already lifted to
the party's level by `denLevel`) rolls **119** through `computeDamage`; the
undocumented `* 0.55` made that **65 = 1.33 % of his max HP**.
`imperial_mt` is not an `Enemies.def` key — the imperial roster is keyed
differently; look it up before reusing that probe.

## What landed

**34 — `enemyScaling`.** The JSDoc said "given the party's level"; the body was
`nightScaling(this.day.hour, isDaemon)` and never touched `this.party`. The doc
is the better design, so the body now implements it. `partyLift` closes
`PARTY_LIFT` = 0.8 of the gap between a spawn's authored level and the party
average, **only upward** (`max(0, gap)`), and since the factor is ≤ 1 it can
never carry a spawn past the party — the ceiling is structural, no cap written.
Returned *separately* from `levelBonus` because both call sites dilute the night
bonus by 0.4 for non-daemons, which would make the party term a rounding error
on exactly the authored spawns it exists to lift.

Wild dens do **not** feel this: `WildTerritories.denLevel` already lifts them and
they come out at 24–28 against a party of 27, so the gap is specific to the
authored `SpawnTables` territories — the level-18 imperial patrol that dies in
11.5 s costing 1.5 % HP. Seven levels of lift is ×1.78 HP, ×1.49 damage.

**35 — pack size.** Hostile wild roster lines drawn two deeper on both ends
(sabertusk `[3,5]→[5,7]`, goblin `[4,7]→[6,9]`, …) across all six rosters.
**Passive lines untouched** — anaks and garulas are scenery, and they are the
largest meshes in the wild roster, so they buy skinned rigs and not a fight.
Engage tokens: `Pack` default 2→3 (which every non-overriding `SpawnTables`
territory inherits), wild dens 3→4, roamers 2/3→3/4.

**Danger — `INCOMING_SCALE`.** `res.damage * 0.55`, written twice with no comment
in either place (`CombatSystem._enemyStrike`, `EncounterDirector.damageThreat` —
the live encounter path). Now one exported, documented constant, **set to 1.0**:
removed rather than re-tuned, because nothing recorded a reason for it and the
formula underneath already softens a blow four ways (240/(240+def) mitigation,
level differential, the attacker's own ×0.9, dodge i-frames). At 1.0 a
level-appropriate field animal costs 2.4 % of Noctis' max HP per landed hit.

**36 — measured negative, and it closes the item.** The plan's "3–12 casts"
warp-throughput figure is **not a cast count**: it is `probes/dpsshare.mts`
lines 113–115, which print warp-strike damage *"from 3 m" / "from 12 m" /
"from 24 m"* — metres of warp distance feeding `combat.warpMotion(dist)`. There
was no throughput problem to fix because there was no throughput measurement.
The real one now exists in `fightshape`'s aggregate. Two instrument bugs were
found on the way and fixed (phase-vs-cast, MP floor).

## After the levers — **verified**, at `4a588f4`, three fights

The page was torn down between rounds 3 and 4 ("Target page, context or browser
has been closed"): fights are now 2–3x longer, so the probe outlives its own
execution context. `7041897` makes the aggregate print after *every* round so a
lost page no longer costs the median.

```
sabertusk x5  lv 28, 2 444 hp each   12 220 hp of den   16.3 s   15.0 % HP   wiped 5/5
voretooth x6  lv 27, 2 361 hp each   14 166 hp of den   16.7 s   12.3 % HP   wiped 6/6
imperial  x6  lv 25, 1 334 hp each    9 274 hp of den   25.8 s    5.5 % HP   wiped 6/6
MEDIAN 16.7 s (was 11.4) and 12.3 % (was 3.2). Both still short.
```

Task 34 is visible in round 3: the Longwythe imperial patrol was **lv 18 /
753 hp** in the baseline and is **lv 25 / 1 334 hp** here, and its round went
11.5 s → 25.8 s, 1.5 % → 5.5 %. Every round now ends `wiped` with the whole pack
dead, where the baseline left 3 of 7 and 4 of 8 standing.

Per-hit cost separates the two failures: sabertusks cost **3.74 % of max HP per
landed hit** and imperial MTs **1.10 %**. The MT round is long *and* safe; the
animal rounds are dangerous *and* short.

`combatloop` **35/35 verified** at `4a588f4`, dungeon rounds included.

## The last lever — `7041897`, being measured

`LEVEL_LIFT` 1.0 → 1.25. The comment calling 1.0 "the ceiling on this lever" was
reasoning about a den of *three*, and said so in its own last sentence ("the rest
of the gap is pack composition and party throughput"); pack composition landed in
`4a588f4`. A mid-band cell now lands ~3 levels over the party rather than level
with it — ×1.28 HP, ×1.18 damage — and `denLevel`'s clamp, already written as
`max(levels[1], party + 5)`, caps the top-of-band cells. It should not touch the
imperial round at all: that is an authored `SpawnTables` territory and does not
go through `denLevel`.

## Not verified yet

- the `7041897` median (run in flight, with `--shot tmp/shots/lane11/`)
- the frames — captured but **not looked at yet**
- both perf gates — **not taken**; must be behind `daemon.mts --wait
  exclusive-free`, and the box has had sweep queue depth ~58 all session.

## Files touched

`src/tools/probes/fightshape.mts`, `src/game/rpg/RpgSystem.ts`,
`src/game/encounters/EncounterDirector.ts`, `src/game/encounters/Pack.ts`,
`src/game/encounters/WildTerritories.ts`, `src/combat/CombatSystem.ts`.
Scratch: `tmp/lane11-dmgmath.mts`.

## Residue / cross-lane

- **FOR LANE 18 (`SpawnTables.ts`)** — pack sizes there were not touched. The
  authored territories now inherit `Pack`'s default of 3 engage tokens instead
  of 2; the six explicit `maxEngaged: 3` overrides (lines 161, 194, 213, 221,
  227, 237 as of `66b354ad`) are now *equal to* the default and could be dropped
  or raised to 4 for the larger patrols.
- `BossFight.ts` 3→4 engage tokens was on the plan's lever list and was **not
  taken**: lane 17's Keycatrich Magitek Commander round is new and is a
  Definition-of-Done content bar, and this lane had no instrument pointed at it.
