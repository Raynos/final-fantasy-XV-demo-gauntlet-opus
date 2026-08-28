# Handoff — `creatures` (WS-10)

Owns `src/characters/enemies/`, `src/characters/Enemies.ts`, `src/game/encounters/`,
`src/tools/creaturecheck.mts`. **`src/characters/rig/` belongs to no one and is
fragile — used, never edited.**

Every claim below is marked **verified** (I captured it and looked, or a gate
printed it) or **reported** (read, not looked at).

---

## 1. The five WS-10 items and where each stands

| item | state |
|---|---|
| Anak sculpt rebuild | **landed, verified by eye** — `cfe9fd2` `9391f29` `15ecca1` |
| Titan's floating `fissure()` wedges | **closed as already-fixed, measured** — see §3 |
| `Enemy.reset()` does not clear five fields | **landed** — `06999dc` |
| Five local `mix`/`blend` helpers -> `Palette.mixc` | **landed** — `5ca2479` |
| `Enemy.level` scaling | **was already landed by another lane; magnitude tuned and re-measured** — see §4 |

---

## 2. The Anak, in three passes

**2 770 triangles -> 13 594**, which is where the rest of the quadrupeds live
(sabertusk 13 021, voretooth 12 890, garula 14 134). Ported from `GeoKit`
primitives to `CBuilder`/`sweep` the way `Sabertusk.ts` is built. The skeleton
is unchanged bone for bone, so `AnakEnemy.pose` and all nine `creaturecheck`
poses address the same geometry.

**Verified**: `creaturecheck --species anak` 9 poses, 0 failures, **0.000 drift
on every one**. `geocheck --set enemies` PASS, and the anak's edge-parity
imbalance went **330 same-direction interior edges to zero** — it also dropped
out of the twelve least-outward geometries. That is the winding check the brief
insists on for a rebuilt shell, and it is orientation-absolute.

Three capture rounds, five framings each (`probes/creaturestage.mts`, below),
every frame looked at:

- **round 1** fixed the four named defects — round-ball feet became cloven
  hooves with a flat sole and dewclaws; the sideways card tail became a swept
  hanging tail with a tuft; the shoulder/neck box became two continuous sweeps
  with the neck's first node inside the chest; the faceting went with 30x26 on
  the barrel against a 10-segment tube.
- **round 2** fixed eight things the first capture showed, of which the two
  worth remembering are **a cut cylinder end stuck on each shoulder** (the leg
  sweeps' start cap sat outside the barrel; node 0 is now buried and the
  shoulder mass moved to node 1) and **ears that rose inside the horns' arc**,
  so the pair read as four blades.
- **round 3** was value: from a broadside the eye sees the ring around
  `cos(theta) = 0`, so the saddle, the stripe and the belly were all inside the
  visible band and *still* collapsed into one mid-dun. The fix was range, not
  position — a stop off DUN, nearly two off the saddle, CREAM up. The eye got a
  real socket via `CBuilder.occlude` after a painted lid ring failed because at
  its radius it fell mostly *under* the eye globe.

**It reads as an animal.** A gerenuk-like grazer: dark saddle, hard lateral
stripe, cream belly and throat, black points, cloven hooves, ribbed backswept
horns, a splayed ear, a dark eye in a socket.

**Still weak, in priority order** (all seen, none fixed):

1. The horns read as flat reeds edge-on. At 26 steps four rib cycles is the
   finest the ring can carry, so the only lever left is amplitude, and it has
   been raised twice already. A wider `flat` ratio is the next thing to try.
2. The face is paler than the neck and the join shows. The blaze, the muzzle
   band and the preorbital gland are all authored and all subtle.
3. The `idle` grazing loop's phase decides whether you photograph a neck or a
   face — 3.1 (what `creaturecheck` holds) is muzzle-down, 5.6 is head-up.

---

## 2b. The palette port, verified two ways

Four files, not the five §WS-10 says: **Garula, Goblin, IronGiant, Sabertusk**.
Coeurl, Dualhorn and Voretooth were converted when `Palette.ts` was written and
are `const mix = mixc` aliases already.

The failure this guards against is not a NaN — `geocheck` gates those at zero.
It is a *finite but wrong* colour: two scratch registers cannot survive a
nested blend, so the outer call blends a colour with itself and a body part
comes back flat and dark with no error anywhere.

- **Measured** (`_probe/blackverts.mts`, bare Node, fraction of vertices under
  0.4% linear reflectance): sabertusk **0 of 6 770** — its head was black for
  its entire existence before `Palette.ts` — garula 0.6%, irongiant 2.4%.
- **Verified by eye**: `bestiary_sabertusk` and `bestiary_irongiant`. The
  sabertusk's head, mask, tusks and orange eye all render; the Iron Giant's
  warm oxidised plate and eye glow render.

**Reported, not changed: the goblin is 24.5% under 0.4% linear** and it is
pre-existing. The daemon-albedo pass that lifted hobgoblin, bussemand, arachne,
necromancer, mesmenir, ronin and red giant ~1.6x — on the measurement that a
daemon at 3-7% reflectance is a flat black cut-out in front of ~30% ground —
did not include the goblin, whose `SKIN_DARK` is 0x191220, about 0.7% linear.
It is a corpus-visible paint change and `bestiary_goblin` is a shot, so it
wants its own capture round rather than a drive-by.

---

## 3. Titan's fissure wedges — **closed, measured negative**

The claim is that a dozen `fissure()` wedges float free above the terrain in
arcs around and in front of the hands. **They do not, and have not since the
bone-binding fix** the `fissure` helper's own comment records: every arm and
hand fissure used to pass `'coreC'`, so the glow stayed with the torso while
the limb geometry moved with its own bones. In bind pose they would have looked
seated; in any other pose they were metres away — which is exactly the
described symptom and exactly what a still capture of a posed boss shows.

Measured rather than asserted (`src/tools/_probe/fissure.mts`, bare Node): the
merged Titan buffer is split into connected components, and for each of the 47
emissive ones the eight AABB corners are tested for containment in *some* rock
component's box.

    21 of 47 buried on all eight corners
    26 with corners outside, worst case 0.32 m
    the largest offenders: palm furnace 0.26 m, shoulder 0.24 m, belly 0.22 m
    every finger and thumb wedge: 0.01-0.05 m

0.32 m on a creature 24 m tall is **1.3% of its height**, and the fingers are
under a fifth of a percent. **Verified by eye** in `bestiary_titan` and in a
hand framing driven from the live set piece: the fissures read as orange light
inside the rock and nothing hovers.

---

## 4. `Enemy.level` — already landed; what I changed is the magnitude

**Both halves landed on 2026-08-27 in `e7f4602`, by another lane**, before
WS-10 was staffed. §WS-10 and the coordinator's brief both describe it as
"built and reverted"; that is out of date. `Enemies.spawn` applies the curve
after the fresh/pooled branches — which is the only place that survives both
writers — and `WildTerritories.denLevel` lifts a wild den toward the party.
**Verified**: `fightshape` spawns a Longwythe sabertusk den at level 21 with
1 381 hp against a listed level 14 and 780 hp.

### What was still wrong, and what I did

`fightshape`, three dens, the scripted policy the original claim used:

| | LIFT 0.7, no poise scaling | LIFT 1.0 | LIFT 1.0 + poise |
|---|---|---|---|
| sabertusk den | lv 21, 1 381 hp, **6.3 s**, 1.3% | lv 28, 2 444 hp, **7.5 s**, 2.1% | *see §6* |
| voretooth den | lv 19, 1 229 hp, **6.8 s**, 0.0% | lv 26, 2 176 hp, **10.2 s**, 0.0% | |
| imperial patrol | lv 18, 753 hp, **16.7 s**, 0.8% | unchanged, **14.1 s**, 1.8% | |

**`LEVEL_LIFT` 0.7 -> 1.0** (`de11493`). 0.7 was a first guess with no
measurement under it; the arithmetic is now written beside the constant. A den
lands at the party's own level rather than seven under it.

**Poise now scales with level** (`e5bc53d`). This is the finding worth keeping.
A log-linear fit of all 23 shipped species against their own listed levels
gives **x1.087 HP, x1.053 poise, x1.048 damage** — the poise column rises with
level exactly as the other two do, and nothing read it. `hurt()` spends
`maxPoise` and staggers at zero, so a lifted den got 1.8x the HP and *the same
poise it had at level 14*: it staggered just as often while taking twice as
long to kill, and the extra HP was spent lying on the ground. The control is in
the same table — the imperial patrol is an authored roamer whose level is not
lifted, its poise still matches its HP, and it is the only one of the three
with a rhythm (0.99 attacks/s against 0.27 and 0.59) and the only one past
fourteen seconds.

### The bound, so nobody re-derives it

**The level curve cannot buy a 20-30 s field encounter, and 1.0 is the ceiling
on this lever.** The party puts **660-730 hp/s** into a wild den. Thirty seconds
needs ~21 000 hp of den — five sabertusks at level 38 — and the bestiary's own
top species, Red Giant at level 50, is 22 000 hp by itself. A three-animal trash
den is not a thirty-second fight at any level that is not absurd, and lifting the
anonymous country above the party is what `WildTerritories`' own comment says a
hunt mark is for. The rest of the gap is **pack composition** (a den draws 3-4
animals; the imperial patrol that lasts longest fields 9) and **warp-strike
throughput** — the scripted policy took 6 warps on the sabertusk den and 12 on
the voretooth den, at 748-1 027 damage each, so raising HP is partly eaten by
more warps. Neither is in this lane's directories.

---

## 5. Instruments — two are new and both are worth keeping

- **`src/tools/probes/creaturestage.mts`** — photographs one species from five
  framings on real ground in real light. Thirteen of twenty-three species have
  a shot in `Shots.ts`; the other ten had no way to be looked at without
  editing the corpus, which invalidates the daemon's warm page. The enemies
  handoff asked three rounds running for a permanent version of the throwaway
  it kept rewriting. `--set __SPECIES=a,b,c`, `--set __POSE=run`,
  `--set __PHASE=5.6`. The **feet** framing exists because feet are where this
  roster is weakest and no full-body shot has ever resolved one.
- **`creaturecheck.mts` now accepts `--dirty`.** Its strict `parseArgs` threw
  `unknown flag --dirty`, so the gate that proves a sculpt change has not
  re-buried anything could only ever be run against `HEAD` — never on the edit
  you are making. It skips `HARNESS_FLAGS` now, the way `perf` and `gameplay`
  do. This is the trap `framecam.mts` records six handoffs hitting.
- `src/tools/_probe/fissure.mts` is a throwaway that earned its keep once;
  promote it if a second creature ever needs an emissive-seating check.

---

## 6. Exact next steps

1. **`fightshape` after the poise change is UNMEASURED.** It was queued behind
   three other lanes' gates for the last hour of this session and never got a
   browser slot. Re-run it:

       node src/tools/probe.mts src/tools/probes/fightshape.mts --lane sweep --ttl 25

   Read the `enemy time:` and `enemy attacks opened` lines against the table in
   §4. Expect stagger occupancy to fall from 28% and `attacks opened` to rise
   from 0.27/s toward the imperial patrol's 0.99/s; duration should follow. If
   it does not, the stagger *threshold* rather than the poise pool is the knob,
   and that is `hurt()` in `EnemyBase.ts` — `poise <= 0` with no scaling of the
   incoming `o.poise`.
2. **`pnpm run check` reached 10 of 19 and stalled on browser slots**, all ten
   PASS (`build` `silhouette` `geocheck` `horizoncheck` `anycheck` `orphans`
   `roadcheck` `hydrocheck` `silrocks` and the second silhouette set). The nine
   that did not run are the browser gates, `creaturecheck` among them — it was
   run standalone against the anak and passed 9/9, but not against the poise
   change, where `combatloop` is the one that matters. `combatloop` spawns at
   listed levels so the level factor is 1 there by construction; that is an
   argument, not a measurement. **Re-run `pnpm run check` on a quiet box.**
3. The three Anak weaknesses in §2.

## 7. Reported, not fixed — outside these directories

- **`RpgSystem.enemyScaling` is documented as reading the party's level and
  does not** — it is `nightScaling(hour, isDaemon)`. `EncounterDirector.activate`
  feeds its `levelBonus` into every authored territory. `src/game/rpg/` is not
  this lane's. Still on `STATUS.md`'s "still weak" list.
- **A wild den fields 3-4 animals and the longest fight of the three fields 9.**
  Pack size is the untouched half of encounter duration. `WildTerritories`'
  `count` ranges are in this lane; `Pack.maxEngaged` decides how many of them
  actually fight, and `spawnRoamer` caps it at 3. Neither has been measured.
- **Warp-strike is still the largest single damage source in a wild den**
  (26-47% of damage from 3-12 casts). `src/combat/`.
