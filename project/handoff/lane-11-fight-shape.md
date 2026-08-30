# Lane 11 — Fight shape (cold-start brief)

Mission: plan tasks 33–36. A wild den fight lasts 5.8–17 s and costs Noctis
0.8% HP at party level 27 — combat has no danger. Exit: median den 18–30 s,
Noctis pays ≥15% HP, combatloop 31/31, both perf gates certify.

Owns: `src/combat/`, `src/game/encounters/`, `src/game/rpg/`,
`src/tools/probes/fightshape.mts`.

## Anchors (verified)
- **Instrument first**: `fightshape.mts` prints 3 rounds, per-round
  `duration Ns` at :328, damage shares at :307-317, warp casts at :262/:329.
  NO median/aggregation exists — add it (run more rounds, print median +
  HP-paid) BEFORE tuning anything, then record the baseline.
- `RpgSystem.enemyScaling` — `src/game/rpg/RpgSystem.ts:720` JSDoc says
  "given the party's level"; :721 body is `nightScaling(this.day.hour,
  isDaemon)` (Stats.ts:507-525) and never reads the party. Decide:
  implement the party read or fix the doc. Note `daemonPressure()` at :724
  DOES read `this.party.averageLevel` — the neighbouring pattern.
- `EncounterDirector.activate` feeds levelBonus into every territory
  (:240-241, daemons full, others ×0.4); explicit per-spawn levels bypass
  it (only `vore_pack` lv7, SpawnTables.ts:159). Duplicated in spawnRoamer
  :353-354.
- Pack-size levers: `Pack.maxEngaged` default 2 (`Pack.ts:49`), engage gate
  :127; wild dens `passive ? 2 : 3` (`WildTerritories.ts:358`); authored
  default 2 with six 3-overrides (SpawnTables.ts:161,194,213,221,227,237);
  `spawnRoamer` `total >= 5 ? 3 : 2` (EncounterDirector.ts:349-352);
  bosses 3→4 (BossFight.ts:79,263). Roster counts [1,1]→[4,7]
  (WildTerritories.ts:108-160).
- `LEVEL_LIFT = 1.0` (WildTerritories.ts:222) is a hand-set constant with a
  design-comment ceiling argument (:207-221), not a mathematical
  saturation. Wild-roster top: Red Giant 22 000 hp lv50
  (RedGiant.ts:32-33). Bestiary-wide: Deadeye 34 000, MagitekArmour
  32 000, Titan 180 000 — do not repeat "top species 22 000".
- Warp-strike throughput: measure with fightshape's by-source shares; the
  recorded "3–12 casts" matches `dpsshare.mts`'s DISTANCE labels
  (:113-115: "from 3 m / from 12 m") — do not trust it as a cast count.

## Commands
- `node src/tools/probe.mts src/tools/probes/fightshape.mts` (baseline
  BEFORE any tuning, again after each lever).
- `node src/tools/combatloop.mts` (must stay 31/31),
  `pnpm run check:perf` for the two perf gates.

## First commits
1. fightshape median + HP-paid + more rounds; record the baseline in this
   handoff.
2. enemyScaling: doc-or-implementation decision, applied.
3. One lever at a time (maxEngaged, roster counts, warp cooldown/damping),
   fightshape between each.

## Landmines
- The steering lesson: a lever that changes AI behavior can be
  self-consistently wrong — pair every fightshape delta with one watched
  capture (`combat_wide --jpeg`) and look at it.
- Perf: more engaged enemies = more skinned rigs mid-fight; watch the
  gameplay gate's 33 ms rule.

## Done-when
fightshape median 18–30 s with Noctis paying ≥15% max HP across ≥5 rounds,
combatloop 31/31, perf + gameplay gates certify.
