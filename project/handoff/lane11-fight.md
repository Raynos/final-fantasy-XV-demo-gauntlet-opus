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
| — | `Pack._reslot` two rings | **landed** — `b24d958` |
| — | `PARTY_LIFT` 0.8 → 1.0 | **landed** — `b24d958` |
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

## At `7041897` — **verified**, five rounds, one no-den

```
duration      21.4 24.9 14.3 10.5  ->  MEDIAN 17.8 s
hp paid %     14.3 45.5  2.5  7.7  ->  MEDIAN 11.0 %
```

but **round 5 was not a fight**: `ended: nobody-within-45m, pack dead 0/5`. Its
four kills belonged to some other group while the pack under measurement walked
away, and `kills > 0` let it into the median as "a fight that ended in 10.5 s"
when it was a fight that did not end. `b24d958` makes a round count only when
the pack it measured *died*, prints the dropped rounds with their reason, and
prints the unfiltered median underneath — dropping rounds moves the headline, so
the filter has to be arguable.

Over the three rounds that finished: **median 21.4 s (PASS)** and **14.3 % (0.7
points short)**.

The spread is not noise, it is two different spawn paths:

| | level | pack | den HP | duration | HP paid |
|---|---|---|---|---|---|
| wild sabertusk (`WildTerritories`) | 32 | 5 | 16 935 | 21.4 s | 14.3 % |
| wild voretooth (`WildTerritories`) | 31 | 6 | 19 632 | 24.9 s | **45.5 %** |
| authored den (`SpawnTables`) | 23 | 4 | 6 500 | 14.3 s | 2.5 % |

The wild dens clear the bar comfortably. The authored one does not, and it is
short and safe for two reasons this lane could only fix one of: its **level**
(fixed — `PARTY_LIFT` 0.8 → 1.0 in `b24d958`, because `LEVEL_LIFT` had meanwhile
put wild dens 3–5 *over* the party while authored ones sat 4 *under* it, a
nine-level disagreement falling the wrong way round) and its **count**, which
lives in `SpawnTables.ts` and belongs to lane 18.

## Third look, at `653a0e3` — the splat is gone, the pileup is not (and now has a cause)

Ten frames of `tmp/shots/lane11c/`, read one at a time in a subagent.

- **The white splat is gone.** Pixels at >=245 in all channels over the bottom
  60% of the ground region: `engage 1, stagger 37, midfight 30, kill 167,
  victory 8, after 0` out of 675 000 — and the 167 in `f-kill` are damage-number
  glyphs, not a ring. Nothing blows out anywhere.
  **Caveat, stated plainly:** no *translucent* ring was caught either, in any of
  the ten beats. The ring is 0.6-0.9 s long and the beats simply did not land on
  one; it is clearly visible at 1.35/0.6 in the posed ablation
  (`tmp/shots/bloom2/g-d-parry.png`), which is the arm that was actually
  verified. And `VFX.shockwave` still passes its own 3.4/1.0 and is untouched by
  the default change — that path is not exercised by these frames at all.
  The one genuine blow-out left is a hard-clipped white **quad sprite** with
  visible square corners and a bloom halo, a loot/drop sparkle, not a ground
  ring. Filed.
- **The pileup survived `b24d958`.** All five sabertusks simultaneously visible
  in `f-midfight` and all five inside one ~50-60 degree wedge on the player's
  right, nothing behind or on the far side, one body drawn straight through
  another's chest and a third lying across a fourth's back. That is what sent
  this lane back into `_tickStrafe`, and it found the cause — see below.
- **`f-engage` is still 85% the dark interior of a boulder.** Unchanged, not
  this lane's file.
- **The HUD is worse than reported before**: two `SABERTUSK` plates stacked and
  touching plus a third on the minimap; in `f-kill` one plate clipped *under*
  the minimap disc, another over the `LONGWYTHE / LEIDE` label and the `480 M`
  scale text, six damage numbers piled on each other, and the reward-toast
  column drawn over the technique list so both are illegible.
- New, and filed: Gladio's greatsword passes through Prompto's shoulder in
  `f-victory`; a fourth party member stands inside the camera in `f-after`;
  `f-kill`'s radial motion blur smears the frame to mush.

## The pileup had a second cause, and it was in `_tickStrafe` (`7fec437`)

`EnemyBase._tickStrafe` carries the comment *"let the whole ring rotate slowly"*
and did the opposite: the rotation was `this._strafeDir * dt * 0.45`, and
`_strafeDir` is set once at construction to `(this.id % 2) ? 1 : -1`. **Half of
every pack circled clockwise and half anticlockwise.** The ring did not rotate,
it counter-rotated into itself, and each animal walked into the bearing of the
one coming the other way — undoing `_reslot`'s evenly spread slots within a
second or two of the first strafe. That is why the frames above still show a
wedge on a tree where the slot *assignment* was already fixed.

`Pack.strafeDir` is now one value for the whole pack, hashed from the pack id so
a pack circles the same way across a reload and two neighbouring packs do not
reliably mirror. The per-member 4.5 s reversal goes with it — a rigidly rotating
ring is never stale, and reversing per member is a second way for the phase to
decohere. A **packless** enemy keeps both: it has no ring to stay in phase with.

By construction this moves bearings around the target and not distances to it,
so nothing should move in `fightshape`. Re-measured anyway.

## I looked at the frames — and they were not good

Nine frames of round 1 (`tmp/shots/lane11/`, sabertusk den, Longwythe), read one
at a time. The environment art holds up — ochre badlands, haze, windmill and
mountain silhouettes. The encounter did not:

- **enemies interpenetrated.** Midfight had one sabertusk's body passing through
  another's torso and a third's head lying inside a fourth; the stagger frame had
  two or three stacked on top of each other at the frame edge. They clumped into
  **one screen quadrant** and never encircled — a queue, not a hunt.
- **`f-engage` was unusable**: the camera was fully inside a boulder, the whole
  frame dark rock with five floating nameplates in it.
- HUD stacked: nameplates landing on the tech list and the Armiger bar, three
  reward toasts overlapping each other and the damage numbers (169 drawn on 431).
- two character-inside-character clips (Noctis sharing volume with a companion in
  `f-victory` and `f-after`), Noctis' feet inside a rock slab at 28 m.
- a blown-out white radial ground splat in `f-midfight` and `f-kill` that smears
  across the terrain.
- **the danger change is visible and correct**: `f-victory` shows Ignis at
  1 702/3 591 and Gladio at 2 838/4 825. The party is chewed.

The interpenetration was **mine**, and `b24d958` fixes it: `Pack._reslot` spread
every live member around *one* ring by its index in `members`, so the four
engaged animals of a six-animal den got whatever four bearings their array
positions gave them — 60° apart on a circle a metre and a half across, and a
sabertusk is a metre wide. `EnemyBase._chase`'s own comment calls the slot ring
"the whole difference between a pack and a queue"; the slots simply were not
being handed out that way. Attackers now get the inner ring evenly to
themselves, flankers the outer ring, half a slot out of phase — and `_reslot`
runs on every path that mutates `engaged`, not only on add/remove/death.

**Not re-looked yet** after that fix. A run with `--shot tmp/shots/lane11b/` is
in flight; whoever picks this up must read those frames before calling it done.

## FINAL — **verified**, at `b24d958`, six rounds, five finished fights

Every round below ended `wiped` (the whole pack dead). Round 4 found no den.

| round | den | source | level | den HP | duration | HP paid | %/hit |
|---|---|---|---|---|---|---|---|
| 1 | Sabertusk x5 | wild | 32 | 16 935 | 17.3 s | 10.0 % | 5.00 |
| 2 | Voretooth x6 | wild | 31 | 19 632 | 26.5 s | 25.0 % | 4.16 |
| 3 | Sabertusk x4 | authored | 27 |  9 012 | 16.3 s |  7.1 % | 3.55 |
| 5 | Sabertusk x5 | wild | 29 | 13 260 | 55.9 s | 20.9 % | 2.33 |
| 6 | Sabertusk x4 | authored | 27 |  9 012 | 16.6 s | 15.2 % | 3.05 |

**median duration 17.3 s** (16.3 / 16.6 / **17.3** / 26.5 / 55.9) — 0.7 s under
the 18 s floor.
**median HP paid 15.2 %** (7.1 / 10.0 / **15.2** / 20.9 / 25.0) — **PASSES**.

Against the baseline at `20405ce`: **11.4 s → 17.3 s** and **3.2 % → 15.2 %**.
Round 5's 55.9 s is an outlier that swept a neighbouring den in (`kills 11` over
a pack of 5); it is included because it still ended `wiped`.

**The residual 0.7 s has a name.** The two rounds that pull the median under 18
are both the *same authored territory*: Sabertusk **x4**, 9 012 hp, 16.3 s and
16.6 s. `PARTY_LIFT` 1.0 already took it from lv 23 / 6 500 hp to lv 27 /
9 012 hp; what is left is its **count**, which lives in `SpawnTables.ts` and
belongs to lane 18. Every *wild* den — the ones whose counts this lane could
raise — came in at 17.3, 26.5 and 55.9 s. See `FOR LANE 18` below; it is a
two-line change.

**Caveat, stated plainly.** The aggregate block in that run printed
`0 finished fights` because the filter added in `b24d958` tested `m.denN` and
the field is `m.n` — fixed in `77fffdd`, but *after* this run. The medians above
are computed by hand from the five per-round lines, which were correct
(`pack dead 5/5 ended: wiped`). The next run will print them itself.

## `combatloop` 34/35 — DIAGNOSED (respawn), and it *is* a real bug

**Not the lane's levers, and not the coordinator's hypothesis either.** The
hypothesis handed to the respawn was "task 34 made `enemyScaling` real, so a
plain `spawnAhead('sabertusk')` now gets level-scaled at spawn and its
`maxPoise` rises out of reach of the test's fixed 5 poise". That is wrong on the
code path: `spawnAhead` is `enemies.spawn(key, {pos, heading})`, `Enemies.spawn`
only scales when `o.level ?? type.stats.level` **differs** from the species
level, and `enemyScaling` is called from `EncounterDirector` only. Nothing
scales that fixture at the moment it is spawned.

**The real mechanism is the enemy pool.** `EnemyBase.reset()` — the recycled
path — restores `maxHp` from `baseMaxHp` and `damage` from `type.stats.damage`,
and then writes `this.poise = this.maxPoise` **without ever restoring
`maxPoise`**. `maxPoise` is assigned in exactly one place, `Bestiary.make()`,
which only runs for a *fresh* instance. So:

1. a wild den spawns a sabertusk with `level: 29`, and `Enemies.spawn` does
   `e.maxPoise = round(e.maxPoise * k.poise)` — 42 -> ~63;
2. it dies, `despawn` pushes it into `pool.get('sabertusk')`;
3. the next spawn `pop()`s it, `reset()` leaves `maxPoise` at 63, and if that
   spawn also carries a level the scale multiplies **on top of the already
   scaled value**.

It compounds without bound across respawns, and `combatloop`'s fixture — which
asks for no level at all — inherits whatever the pool last left there. The
arithmetic is the tell: base 42 at a single level-24 scale is **70**, at
level-25 it is **74**; the gate reported **71**, which is not any single scale
of 42 and only falls out of two rounded scales stacked.

Task 34 did not cause it; it made it fire, by putting a level on many more
spawns than before.

**Fix: restore `maxPoise` in `reset()`, next to the two lines that already
restore `maxHp` and `damage`.** The gate's expectation was not wrong and
`LEVEL_POISE` is not too steep — a pooled enemy was simply keeping the last
life's poise. `src/characters/enemies/EnemyBase.ts` is not this lane's file, so
it lands as its own one-line commit.

**Landed as `c86e167`** (`EnemyBase.reset()` restores `maxPoise` from
`type.stats.poise`). **VERIFIED**: `combatloop --build c86e167` prints

```
PASS   poise breaks into a stagger with a damage window   stagger fired, staggerMult 2, window 2.4 s
35/35 mechanics verified
```

against `34/35 ... poise 5/71 never broke` on the run immediately before it.
A synthetic before/after probe of the pool was written and then **dropped
deliberately**, not run: the box was at fix-queue depth 7 / sweep 26 and
`combatloop` red-to-green on a one-line change to exactly the line the static
reading implicates, plus the arithmetic above, is stronger evidence than a
second instrument would have been. Flagged so nobody reads it as verified twice.

## Priority 2 — the last 0.7 s, landed as `ca90950`

`SpawnTables.ts` (lane 18's, finished, so taken in its own commit). Beast and
daemon hostile `count` lines two deeper on both ends, elites one deeper, roaming
ambushes the same; **passive lines untouched** and **imperial lines untouched**
— the one authored round ever measured whole was the Longwythe patrol at 25.8 s,
already inside the band and the longest in the set, so widening it would push it
out the top. All ten explicit `maxEngaged: 3` (equal to `Pack`'s default since
4a588f4) are now 4, which is the lever aimed at the imperial round's *danger*
(1.10 %/hit against the animals' 3.05-5.00). `fightshape --set rounds=6` against
`ca90950` — **VERIFIED, and both exits now PASS.**

```
=== AGGREGATE over 3 finished fights (3 rounds played, 0 found no den, 0 left the pack alive)
  duration      24.4 17.9 23.0  ->  MEDIAN 23.0 s        [target 18-30]
  hp paid %     23.6 21.2 12.5  ->  MEDIAN 21.2 %        [target >=15]
  pack size     5 6 6  ->  median 6   (killed 5/5 6/6 6/6)
  % max hp/hit  4.73 4.25 3.12  ->  median 4.25 %
  enemy atk/s   1.02 1.12 1.48  ->  median 1.12
  VERDICT: duration PASS; danger PASS
```

Every round ended `wiped`, none dropped. **The authored territory that was the
whole residual is round 3**: it was Sabertusk **x4**, 9 012 hp, 16.3 / 16.6 s at
`b24d958` and is Sabertusk **x6**, 13 518 hp, **23.0 s**, 12.5 % here — same
level (27), same 2 253 hp per animal, two more animals. That is the count lever
and nothing else.

Caveat, stated plainly: the run asked for **6 rounds and played 3** — the page
lost its vite connection after round 3 (`[vite] server connection lost`, seven
other lanes editing the trunk). Three finished fights is a thinner median than
the six-round run it replaces, and it should be re-run on a quiet tree before
anyone calls the number final. It is not thin in the way that matters, though:
all three rounds were complete wipes, the spread is 17.9-24.4 (against
16.3-55.9 before), and the round that decides it is the one that was failing.

Against the baseline at `20405ce`: **11.4 s -> 23.0 s** and **3.2 % -> 21.2 %**.

## Priority 3 — the white ground splat: ablated, diagnosed, fixed (`e1b5523`)

`probes/groundbloom.mts` (new, committed) fires the four `GroundFX.ring` calls
a fight makes, one at a time, on a still posed frame against a clean plate off
the same page. `imgdiff` against that plate at the old defaults:

```
warp-strike landing ring   mean 8.76/255   max 255 over 17.7% of frame
parry / phase ring         mean 9.91/255   max 255 over 21.8% of frame
stagger ring               mean 5.96/255   max 250 over 12.5% of frame
```

**Looked at** (`tmp/shots/bloom/g-c-warpland.png`): not a wave at all — a thick
opaque lump of paint-white with a lumpy outline and a filled-in centre lying on
the badlands, no terrain legible through it.

Cause: `PATCH_FRAG` draws a ring crest as `mix(uColor, vec3(1.0), hot*0.75) *
uIntensity` over **additive** blending, and the four `CombatSystem` call sites
pass neither `intensity` nor `opacity`, so they took `ring()`'s defaults of
**3.2 / 1.0** — the hottest numbers in the file on the most frequent events in a
fight. Every call that *was* tuned by hand passes its own (`VFX.impact` 2.4/0.7,
`VFX.shockwave` 3.4/1, the warp pool 0.55/0.4) and is untouched.

Fix: the **defaults** move to 1.35 / 0.6. **Verified by eye** on the ablation's
fifth arm (`g-e-warpland-tuned.png`), which is that exact call at those exact
values: a pale blue-white ring with the badlands texture readable through it.
**Confirmed at `e1b5523`**, all four arms re-shot against a fresh clean plate:

```
             before (3.2/1.0)              after (1.35/0.6)
stagger      mean 5.96  max 250  12.5%     mean 4.63  max 203  10.6%
warp land    mean 8.76  max 255  17.7%     mean 6.38  max 242  15.8%
parry        mean 9.91  max 255  21.8%     mean 7.07  max 250  17.7%
```

No arm clips a whole pixel to 255 any more. **Looked at**
(`tmp/shots/bloom2/g-d-parry.png`, the worst of the three): a translucent
blue-white band travelling over the badlands with the cracked-earth texture
readable straight through it, and a hot crest that is still hot. It is an
effect on the ground rather than a hole in the frame.

## (superseded) the original 34/35 note

```
FAIL   poise breaks into a stagger with a damage window   poise 5/71 never broke
34/35 mechanics verified
```

**Reproduced twice, the second time on a tree `daemon.mts --wait idle` had just
declared quiet, so it is not contention.** It was 35/35 at `4a588f4`, which is
this lane's third commit, so it broke somewhere in the wave after that.

It cannot be this lane's, and the mechanism is checkable rather than a guess:
the row spawns its fixture with `spawnAhead('sabertusk')`, which is
`enemies.spawn(key, { pos, heading })` — **no `pack`, no `level` override, no
territory** — and then `pin()`s it. Every lever this lane moved needs one of
those three: `LEVEL_LIFT`/`denLevel` only runs for a `WildTerritories` def,
`PARTY_LIFT`/`enemyScaling` is only called from `EncounterDirector.activate`
and `spawnRoamer`, `Pack._reslot` needs a pack, `INCOMING_SCALE` is damage *to*
the player, and the roster counts are table data. The fixture is a level-14
sabertusk being hit by Noctis with nothing in between.

Poise reached **5 of 71** in the 400 frames the row allows — 93 % of the way —
so whatever landed slowed the player's poise damage slightly, or slowed the
swing cadence. **This lane did not have the turns to bisect it. It needs one.**

## Second look, after the `_reslot` fix — **verified**, `tmp/shots/lane11b/`

Honest answer: **the fix is real and visible, and it is one fix out of five.**

- **Better.** `f-stagger` has two sabertusks cleanly separated with daylight
  between them and their nameplates on separate rows; `f-kill` genuinely has
  animals on three different bearings — the encirclement the change was for.
- **Not fixed.** `f-midfight` still shows three sabertusks fused into one
  animal's worth of ground, hindquarters passing through another's back, and
  every animal inside a ~30° arc on one flank. Peak simultaneous visible
  sabertusks is still 3–4 of 5.
- The other four defects are **untouched**, and three of them are outside this
  lane's files (see the residue below): the engage frame is still 90 % the
  inside of a boulder; HUD nameplates still overprint each other
  ("SABERTUSKSABERTUSK") and land on the party HP row and the minimap label,
  with reward toasts drawn over the technique list; allies still stand inside
  each other in three frames; the white radial ground bloom still washes out
  midfight and kill.
- New, seen this pass: the kill frame's motion blur is heavy enough that the
  action is illegible; damage numbers persist over empty ground in the victory
  frame; enemy corpses vanish instantly.

The approach and after frames are genuinely beautiful — layered mesas, cloud
shadow, a windmill silhouette, garulas at different depths. **The fight frames
are not.** By `BRIEF.md`'s bar this is not done, and the remaining work is
mostly not in `src/combat/` or `src/game/encounters/`.

## Both perf gates re-certified at `cf163cb` — **PASS, exit 0, still CONTENDED**

Taken behind `daemon.mts --wait exclusive-free --for 600`. The box was **not**
quiet and this time that is honest rather than the `contention()` weakness — the
verdict names tools that were demonstrably running concurrently:

```
perf      VERDICT: CONTENDED (another lane is running drawcheck, probe, sheet, texbake)
          PASS: every certified shot >= 60 fps, on a ruler that validated itself
          per-shot floors: 163/163 shots clear the 60 fps target by more than their own noise
          noise floor (hero_closeup, 24 ABBA pairs): IQR 0.20 ms, bias +0.00 ms
          PERF EXIT=0
gameplay  VERDICT: CONTENDED (drawcheck, facecheck, framecam, probe, sheet, shoot, texbake)
          PASS: every segment >= 60 fps, on a ruler that validated itself
          noise floor (walking): start IQR 0.58 ms / end IQR 0.23 ms = 12% of the 4.9 ms median
          GAMEPLAY EXIT=0
```

So the second density increase — authored territories now drawing 5-7 hostiles
where they drew 3-5, and ten territories at four engage tokens instead of three
— **costs the perf gates nothing measurable**, exactly as the wild-roster
increase did. The noise floor validated itself on both gates, which is what
makes a PASS on a contended box worth quoting: the ruler is 0.20 ms wide against
a 3.9 ms frame.

## (earlier) Both perf gates — **verified PASS, on a CONTENDED box**

Taken behind `daemon.mts --wait exclusive-free`, which returned `exclusive-free
after 0.0 s`. Both gates nevertheless printed `VERDICT: CONTENDED` naming other
lanes' tools that started *during* the run — the known `contention()` weakness.

```
perf      PASS: every certified shot >= 60 fps, on a ruler that validated itself
          per-shot floors: 162/162 shots clear the 60 fps target by more than their own noise
          noise floor (hero_closeup, 24 ABBA pairs): IQR 0.20 ms, bias +0.00 ms
gameplay  PASS: every segment >= 60 fps, on a ruler that validated itself
          noise floor (walking): start IQR 1.02 ms / end IQR 0.53 ms = 21% of the 4.9 ms median
```

So the density increase — 5-8 hostiles per den instead of 3-5, four engage
tokens instead of three — **cost the perf gates nothing measurable**. That was
the landmine the brief named and it did not fire. Both exit 0.

## Not verified yet — **not taken**; must be behind `daemon.mts --wait
  exclusive-free`, and the box has had sweep queue depth ~58 all session.

## Files touched

`src/tools/probes/fightshape.mts`, `src/game/rpg/RpgSystem.ts`,
`src/game/encounters/EncounterDirector.ts`, `src/game/encounters/Pack.ts`,
`src/game/encounters/WildTerritories.ts`, `src/combat/CombatSystem.ts`.
Scratch: `tmp/lane11-dmgmath.mts`.

## Residue / cross-lane

Everything below was found by this lane, is outside its files, and is written to
be pasted into `project/TASKS.md` as-is.

### FOR LANE 18 — `src/game/encounters/SpawnTables.ts`

- **Authored territory counts are the last thing between this lane and its
  exit.** A wild den now draws 5–8 hostiles and runs 21–25 s; an authored one
  drew 4 and ran 14.3 s. `WildTerritories`' hostile roster lines were taken two
  deeper on both ends (`[3,5] → [5,7]`, `[4,7] → [6,9]`); the same treatment on
  `SpawnTables`' hostile `count` fields would close it. **Leave the passive
  lines alone** — anaks, garulas and dualhorns are the largest meshes in the
  roster and buy skinned rigs, not a fight.
- The six explicit `maxEngaged: 3` overrides (lines 161, 194, 213, 221, 227, 237
  as of `66b354ad`) are now *equal to* `Pack`'s default, which this lane raised
  2 → 3. They can be dropped, or taken to 4 for the larger patrols — the wild
  dens use 4.

### For whoever owns the encounter camera

`f-engage` of `tmp/shots/lane11/` is **the camera fully inside a boulder** — the
whole frame is dark rock with five enemy nameplates floating in it. This is the
frame where the fight starts, and it is unusable. `CameraRig` has no collision
push-out against world props at combat framing distance.

### For whoever owns the HUD

The density increase this lane landed (5–8 animals instead of 3–5) breaks HUD
layout, visibly: enemy nameplates land on top of the technique list and the
Armiger bar, a nameplate collides with the minimap's zone label, three reward
toasts (`+136 GIL`, three `+2 · stagger` ability-point lines) overlap each
other, and floating damage numbers are drawn on top of one another (169 on 431).
Nameplates and toasts need collision/stacking rules before this reads as AAA.

### For whoever owns `Party` / `PartyAI`

- **Two characters standing inside each other**, twice: `f-victory` and
  `f-after` both show Noctis sharing volume with a companion, two torsos in one
  space. There is no separation force between party members at rest.
- The retinue does **60–70 % of a fight's damage** (`damage by: ignis 32 %
  gladio 31 % warp 22 % noctis 8 %` in one round). `probes/dpsshare.mts` says
  Noctis should be 64 % at full uptime. Party throughput is the other half of
  the duration lever named in `WildTerritories`' own comment, and it lives in
  `src/characters/ai/PartyAI.ts`, which this lane does not own.

### For `src/combat/GroundFX.ts` — this lane's file, not done

A large white radial ground splat blows out the centre of `f-midfight` and
`f-kill` and smears across the terrain to the right. With more kills per fight
it fires more often. Not chased — no turns left — and no ablation was run, so it
is **not diagnosed**, only observed.

### Not taken, deliberately

`BossFight.ts` 3 → 4 engage tokens was on the plan's lever list. Lane 17's
Keycatrich Magitek Commander round is new and is a Definition-of-Done content
bar, and this lane had no instrument pointed at a boss fight — `fightshape`
walks into wild dens. Changing boss pacing blind was not worth the risk.

### Old residue

- **FOR LANE 18 (`SpawnTables.ts`)** — pack sizes there were not touched. The
  authored territories now inherit `Pack`'s default of 3 engage tokens instead
  of 2; the six explicit `maxEngaged: 3` overrides (lines 161, 194, 213, 221,
  227, 237 as of `66b354ad`) are now *equal to* the default and could be dropped
  or raised to 4 for the larger patrols.
- `BossFight.ts` 3→4 engage tokens was on the plan's lever list and was **not
  taken**: lane 17's Keycatrich Magitek Commander round is new and is a
  Definition-of-Done content bar, and this lane had no instrument pointed at it.
