# Lane 11 — Fight shape

Plan items 33–36 of `docs/plans/2026-08-30-fable-to-nine.md`.
Exit: median den 18–30 s, Noctis pays ≥15% max HP, `combatloop` green (35/35
since lane 17), both perf gates certify.

Owns `src/combat/`, `src/game/encounters/`, `src/game/rpg/` **minus**
`SpawnTables.ts` (lane 18), `Shops.ts` / `Npcs.ts` / `Quests.ts` (lane 19).

## Status

- **33 instrument — LANDED** (`ed53de5`).
- 34 `enemyScaling` — in progress.
- 35 pack size — not started.
- 36 warp throughput re-measure — not started.

## 33 — `fightshape` now computes a median

`src/tools/probes/fightshape.mts` printed three beat sheets and aggregated
nothing, so "a wild den runs 5.8–17 s" was three anecdotes across a roster whose
`count` fields are *ranges* — a 3x spread you get for free.

What it does now:

- `--set rounds=N`, default **5**, eight headings authored (was a hard 3).
- one metrics row per round: duration, HP paid, kills, pack size, den HP dealt,
  Noctis' damage share, enemy attacks/s, and **warp casts** taken from
  `combat`'s own `warp` event, kept separate from Q key-taps (task 36 needs the
  cast, and the policy taps Q whether or not the cast is accepted).
- an `AGGREGATE` block: every round's value beside the median, then a `VERDICT`
  against 18–30 s and ≥15% HP.
- rounds that found no den, or killed nothing, are **listed and excluded** from
  the median.

Command: `node src/tools/probe.mts src/tools/probes/fightshape.mts --set rounds=5`

## Numbers

(baseline pending — first 5-round run in flight)

## Files touched

- `src/tools/probes/fightshape.mts` — instrument (mine).

## Open questions

- none yet.
