# Handoff — night road danger (plan task 64)

**Lane:** make task 64 (`RegaliaSystem._nightRoadDanger`) verifiable, then verify it.
**Owns:** `src/tools/probes/longplay.mts`.
**Reads but does not edit:** `src/world/vehicle/RegaliaSystem.ts` (lane 10, finished),
`src/game/encounters/EncounterDirector.ts` (lane 11, LIVE — not touched).

## The trap this lane exists to close — verified

The plan's done-when says `longplay --night`. **There is no `--night` flag.**
`src/tools/probe.mts:98` — `VALUE_FLAGS = new Set(['--shot','--ttl','--turbo','--set','--cpu'])`
— and the only page-side knobs are `--set KEY=VALUE`. An unknown `--` flag is
dropped silently, so the run returned `PASS — 30 minutes of continuous play`
about a **daytime** session. Green, real, and about the wrong thing.

**Second half, worse and previously unrecorded: the clock does not run.**
`Sky.hours` (`src/world/Sky.ts:454,905`) starts at 12 and only ever moves inside
`setTimeOfDay`. `DayCycle.syncFromSky` is true and `driveSky` false
(`src/game/rpg/DayCycle.ts:167-168, 210-231`), so `rpg.day` mirrors the sky and
nothing advances either. **Every longplay ever run was thirty minutes of 12:00**,
and nothing in its output said so. Verified by reading, and confirmed by the new
summary line on a real run.

Consequence for task 64: `_nightRoadDanger` (`RegaliaSystem.ts:780`) needs
`nightDanger() > 0.5` **and** `isDriving` **and** `body.speed >= 8`. A walking
session at noon reaches **zero lines** of it.

## Done and verified

- **`longplay` night mode** — `--set __PLAY_NIGHT=1` (or `=23.2` for an explicit
  hour). Commit `b836a14`.
  - Pins the clock with `Sky.setTimeOfDay` (the documented cross-system API,
    `BRIEF.md:90`; the same call `Game.applyShot` and six other probes use — no
    other canonical hook exists). Default 23.2 → `nightScaling` depth 0.84, above
    both the feature's 0.5 floor and `ronin_duel`'s own 0.6.
  - **Drives.** Alternating legs: `__PLAY_DRIVE_LEG` game-minutes (default 3)
    with Ignis at the wheel via `autoDrive.setTargetS`, against `__PLAY_FOOT_LEG`
    (default 2) on foot doing what the day session does. ~18 of 30 min above the
    speed gate. Refuels below 0.2 (a tank is 14 km, the leg is longer); wraps the
    car back to the near end of the highway when it runs out of road
    (`RoadPath.at` clamps — the road is a line, not a loop).
  - **Pulls over** when an ambush lands: at 24 m/s against a 90 m leash the car
    drives out of every encounter the feature creates, so a spawn nobody meets
    proves nothing.
  - **Says what it exercised.** Every run — day or night — now names the hour,
    `nightDepth` and `nightDanger()` in the banner, the summary and the
    PASS/FAIL line. A day run says outright that the night was not tested.
  - **Counts task 64.** Two instance-level wrappers (no other lane's file is
    edited): one on `reg._nightRoadDanger`, one on `enc.spawnRoamer`, plus an
    `encounter:warn` listener and a wrapper on `Story.talk.react`. Reports rolls,
    spawns, HUD warnings, banter lines, and a per-roll log of the gate conditions
    it saw — depth, km/h, `suppressRoamers`, `boss`, enemies within 90 m — so a
    zero is diagnosable instead of a shrug.
  - Forage rate is now per minute **on foot**, not per session minute: nobody
    picks berries through a car window at 86 km/h.

## Results

**Smoke run, 4 game minutes, `b836a14`, tree `a82ae460511a`, `--turbo 10`** (1.1
min wall, 0.28 wall-min per game-min):

    --- 4 minutes of continuous play, clock pinned at 23:12
        (nightDepth 0.84, nightDanger() 0.84) — NIGHT MODE, on the road ---
      drove 10.00 km over 3.0 game min in the car, 1.0 min on foot, 1 road wrap
      _nightRoadDanger: reached on 10830 frames, rolled 1x, spawned 0,
        HUD warned 0x, banter 0x
      roll @ 1.3 min: depth 0.84, 84 km/h, suppressRoamers=false, boss=false,
        enemiesWithin90m=2 -> no spawn

  All thirteen existing dead-end checks stayed green at night. The one roll the
  session had time for was **blocked by `enemiesWithin90m=2`**.

  That run also exposed a bug in the reporting, fixed in `5307577`: the
  dead-end block calls `rpg.camp({force:true})`, camping sleeps until morning,
  and every line that read the hour was reading 06:30 the next day rather than
  the session. The clock is now snapshotted the instant the loop ends.

**30 game minutes, `5307577`, tree `0ff2a4d6f265`, `--turbo 10`** — 6.4 min wall,
50.88 km travelled (inflated: see below), 29 encounters, 212 kills, 0 page errors.
**The feature works.**

    --- time of day: 23:12, nightDepth 0.84, nightDanger() 0.84
        (held 0.84..0.84 across the session) ---
      drove 48.94 km over 19.6 game min in the car, 6.0 min on foot,
        1 refuel, 4 road wraps
      _nightRoadDanger: reached on 70537 frames, rolled 11x, spawned 6,
        HUD warned 6x, banter fired 6x, pulled over for 6
      what it put on the road: daemon_pack x5, ronin_duel x1
      of 11 rolls: 6 landed; blocked by 0 depth<=0.5, 0 suppressRoamers,
        0 boss, 5 a live enemy within 90 m, 0 unexplained

  All eight night assertions green. Two of the thirteen standing checks went
  red — `fights end` (director state "combat") and `the party is still with him`
  (168m 32m 161m) — and **neither is a dead end**: the last ambush landed at game
  minute 29.3 of 30 and the session stopped in the middle of the fight it had
  itself started. Fixed in `3d0617a`: the last fight is now played out (up to two
  game-minutes, eight times the longest fight this probe has ever recorded) and
  the party given three seconds to close up, before either check is asked. A
  confirming run is in flight.

  That run's kilometre figures were inflated — `enter()`/`exit()` and the road
  wrap teleport Noctis and all three landed in `travelled` (9.79 km at minute 3
  against 2.43 at minute 2, one `body.reset`). Fixed in `10ab910`; the roll and
  spawn telemetry is unaffected.

**Day control, 6 game minutes, `11e4f51`** — `PASS`, and **2.14 km**, which is
`TIMINGS.md`'s recorded figure for this probe's minute 6 to the metre: night mode
did not move the day route. (3 encounters / 18 forage against TIMINGS' 4 / 19 —
drift from tonight's other lanes, not from this change; the route is identical.)
It also exposed that the day session runs at **14:00**, not noon: `applyShot`
pushes `SHOTS[name].time` into the sky and `hud_field.time` is 14.0.

## The finding: the "already fighting" guard is a proximity guard

`RegaliaSystem.ts:792` — `if (enc.enemies && enc.enemies.countNear(pos, 90) > 0) return;`

The doc above it says *"never on top of a fight already happening — 90 m"*, but
`Enemies.countNear` (`src/characters/Enemies.ts:341`) counts **every live enemy**
— grazing, unaware, asleep in a den 89 m off the road — not enemies in a fight.

**Measured, 11 rolls over 19.6 game minutes of night driving: 5 of the 11 were
blocked this way, and nothing else blocked anything.** Depth, `suppressRoamers`
and `boss` never blocked a single roll. So the guard is the only thing standing
between the player and roughly twice as much night road, and it is firing on a
condition that is not the one it is documented to test — at depth 0.84 the
director streams territories within 170 m against a 28-creature budget, so there
is very often something alive within 90 m of a car on the highway.

Not a bug that breaks the feature — it fired six times in thirty minutes, which
is a good rate — but the *intent* and the *instrument* differ. The director's own
roamer roll uses 60 m (`EncounterDirector.ts:984`). Candidate one-liners: drop
to 60 m for parity, or count `e.inCombat` / `pack.alerted` rather than `!e.dead`.
**Lane 10's file — reported, not taken.**

## Not done / residue

- `probe.mts` should **reject unknown `--` flags** rather than dropping them.
  That is what would have caught `--night` in one second. Not done here:
  `probe.mts` is shared and seven lanes are invoking it right now. Residue for
  `project/TASKS.md`.
- The plan's done-when text still says `longplay --night`; the real command is
  `--set __PLAY_NIGHT=1`.
