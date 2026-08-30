# Lane 22 — Chocobos (plan items 70, 71)

Status: **task 70 landed and verified by eye (lifetime 1). Task 71 landed: two
of three races verified end to end by a probe, the third cut as a measured
negative, and both hubs looked at in frames.**
Lifetime 2 of an expected 3–4.

## The done-when that mattered: a race, run

`chocoborace.mts` against `HEAD`, Wiz Chocobo Post, verbatim:

```
Wiz Chocobo Post — poi wiz_chocobo at (-2050, 460), ground 25.0 m
interactable chocobo-stable-wiz: "Tend Wiz Chocobo Post" at ground 24.9 m, 5.7 m away
interactable chocobo-races-wiz:  "Read Race Board"       at ground 24.9 m, 17.2 m away
dye Black -> node "dyed", colour now black, gil 42180 -> 30180, owned yellow/black
feed -> node "fed", tier 1, greens left 0
enter "The Paddock Sprint" -> started, entry 100 gil (30180 -> 30080)
riding: true, gates 4
  gate 1: (-1972, 522) h=24.9 r=9     gate 3: (-1954, 392) h=24.3 r=9
  gate 2: (-1900, 468) h=25.3 r=9     gate 4: (-2044, 436) h=25.1 r=10
RESULT WON  21.75 s  (par 44)  +1800 gil  +6 AP
gil 42180 -> 31880   AP 148 -> 154
after: running=false, riding=true, waypoint=cleared, clock DOM=removed
```

Everything in task 71's chain works: both prompts register on real ground, the
dye and the feed transact **through the real dialogue rows**, the board takes
the entry fee, the bird comes to the line, four gates are cleared in order, the
purse and the AP pay, and the waypoint and the clock DOM clean themselves up.
No gate needed the legality search on flat Duscae.

**And the number found a defect.** Par was 44 and the perfect lap is 21.75, so
the beat-par bonus was not a bonus. All three pars re-set against the measured
decomposition in `56238a1`; the paddock is now par 25.

`race_weaverwilds` also won: **76.34 s** against a par of 118, six gates,
ground 22.7–27.2 m, none legalised. Its par is now 88.

## The measured negative: the Alpine Stable

**`race_alpine` is cut and `meldacio_layby` is back to `type: 'parking'`
(`af2ba26`).** Two instruments agreed, so the item closes.

```
Alpine Stable — poi meldacio_layby at (-1560, -2860), ground 248.1 m
  gate 1: (-1498, -2802) h=263.0     gate 4: (-1402, -3024) h=205.2
  gate 2: (-1406, -2834) h=245.2  [legalised 18 m off the authored spot]
  gate 3: (-1308, -2926) h=230.3     gate 5: (-1538, -2922) h=264.3
RESULT DNF  240.01 s  (par 80)  +0 gil  +0 AP
```

59 m of relief across five gates and an autopilot on a perfect line at full
sprint never finished inside four minutes. And with the POI re-typed `chocobo`,
four `dresscam` bearings showed **`PoiKits._chocobo` has no terrain follow**:
the barn's long wall overhung the Route 5 carriageway by ~1.7 m, half the feed
silo stood on the road, the barn's east third was inside the mountain with its
west gable cantilevered over a cliff, and the paddock ring, trough and
signboard did not render at all.

**The Alpine Stable keeps the half that works** — its prompts terrain-snap and
the probe transacted a sylkis tier there. `ChocoboHub` now registers a race
board only at a hub with a course posted, so there is no empty board.

To bring it back: a `PoiKits` job first (terrain-following placement, a
road-clearance offset, a ring sized off the POI's own `r` — 48 here against 200
at Wiz, and the kit reads neither), then walk the pass with `dryground.mts` and
author gates on rideable ground, wider than 11 m.

## Where to pick this up (the exact next step)

1. **The rider's arms.** The frames say they are *still* wrong: the near hand
   holds the rein correctly (the strap runs from the bit to it) but the far hand
   is open at chin height with the upper arm ~40° clear of the ribs, and it
   reads as waving. **`POSE_RIDE`'s numbers are provably mirror-symmetric** —
   `Skeleton.ts`:154 mirrors bone *translation* only (`mx` negates x and never
   touches orientation), so both arms share one rest basis and `[x, −y, −z]`
   *is* the correct mirror. So the asymmetry is not in the table. Two live
   hypotheses, in order: (a) the whole arm chain simply reaches too high and
   forward — `lowerArm x −0.72` with `hand z ±0.42` — and a ¾ view exaggerates
   the far one; (b) what the `head` framing caught was a *companion's* arm, not
   Noctis'. `e8051ea` widened the ride framings, so re-shoot before re-tuning.
2. **Re-shoot the bird** — `chocobostage --set __MODE=ride` — and check the
   shingle fix. The rump is fixed (thin dark-olive seams, not black slots, and
   not artichoked) but the **shoulder/fore-flank still spikes**: the pitch
   falloff `0.30 * (1 - phi0 * 0.28)` is keyed on the ring angle, and the
   forward stations need it too.
3. Take `npcdraws` / `drawcheck` with the bird in frame — still owed from
   lifetime 1.

**Harness note:** `harnessstats` reported **60% of all harness time spent
queueing** tonight, p90 lease wait 4.3 min, worst 23 min. The `--dirty` arm
additionally pays a cold prewarm (p50 **7.9 min**, p90 **28.8 min**) — a
`--dirty` run of this probe was queued for 25 minutes and then failed on a
one-line bug. **Commit, then run against `HEAD`**; post-commit prewarms the sha.

## Task 71: what landed

All committed. `race_paddock` is **verified end to end by a probe** (above).
**Nothing here has been seen in a frame.** Treat every visual claim as *not
verified*.

- **`src/game/chocobo/ChocoboHub.ts`** — two stables (`wiz` at `wiz_chocobo`,
  `alpine` at `meldacio_layby`), each registering two interactables: a `Tend`
  prompt at the stable and a `Read` prompt on the race board. Both open a
  `DialogueScript` through `Interaction.say()`.
  - **Colours**: `DYE_PRICE` — yellow free, green 2 500, red 3 500, blue 5 000,
    white 7 000, black 12 000. Sold **only at Wiz**, per the plan. A dye is a
    rebuild of the merged prototype (cached per colour), driven by
    `ChocoboSystem.setColour`, which puts a rider down first.
  - **Sylkis**: `FEED_TIERS`, four steps, 0 / 2 / 4 / 7 bunches of
    `sylkis_greens`. **They raise the sprint ceiling and the tank; they never
    touch cruise.** That is the load-bearing decision — cruise is
    `WorldMap.SPEED.chocobo` to two decimal places and the map's whole ETA table
    is priced on it, so an upgrade that raised it would make the map a liar
    again. `ChocoboBody.sprintMul` is the new knob.
  - Feeding also finally reads `Ascension.value('chocoboStamina')`
    (`exp_choco2`), which nothing in the repo had ever read.
- **`src/game/chocobo/Races.ts`** — two authored courses, both **won by the
  probe**: `race_paddock` (Wiz, 4 gates, par **25** s, 100 g in / 900 g + 4 AP,
  measured 21.75) and `race_weaverwilds` (Wiz, 6 gates, par **88** s, 400 g in /
  3 200 g + 9 AP, measured 76.34). Beating par doubles the purse and pays 1.5×
  AP. **Par is set off the measured perfect lap, not an estimate** — the header
  carries the decomposition, because the first guess was out by a factor of two.
  A third, `race_alpine`, is cut; the note at the foot of `RACES` is its
  obituary.
  - Gates are authored as **offsets from the hub's POI** and legalised at the
    start line through `canStandAt` with a bounded square spiral (6 m steps,
    7 rings). A hand-placed number in generated terrain is a gate that can land
    in a lake.
  - Radius-tested here, **not** through `Triggers` — see the file header for
    why. Markers are one open cylinder per gate, only the next two visible, so
    a race costs two draws over the ride.
  - The purse pays through `Ascension.grantRaw`, so no row was added to
    `AP_RULES` in another lane's file.
  - A dismount mid-race aborts it; so does `course.limit` seconds.
- **`src/tools/probes/chocoborace.mts`** — the done-when instrument, and it
  passes on `race_paddock` (see the top of this file). It walks
  into the yard, checks both interactables registered, buys a dye and a feed
  tier **through the real dialogue rows**, enters through the board's own row,
  and then *plays* the course: an autopilot wraps `Input.update` and writes
  `input.move` in camera space, so every metre goes through the real
  `ChocoboBody`. A course this cannot finish is a course a player cannot finish.
  **No `import('three')` in a probe body** — it is evaluated inside the page,
  where a bare specifier does not resolve. `f522af4` replaced it with the
  matrix arithmetic.
- **`Quests.ts`** — `side_chocobo` re-keyed: `requires: []`, `autoAvailable`.
  **Quest state only; no chapter and no POI `gate:` field** (lane 17 deleted
  that repo-wide and its done-when is that grep stays at zero). The reward drops
  the whistle — you start with it — and pays sylkis instead, plus a dye on the
  house at Wiz's stall (read live from quest state in `ChocoboHub`, nothing is
  granted or saved).
- **`WorldMap.ts`** — `meldacio_layby` was re-typed `chocobo` and then **put
  back to `parking`** after the frames; the row now carries the whole negative
  as a comment so nobody re-types it without fixing `PoiKits` first.
- **`NpcDialogue.ts`** — three new Wiz nodes (`dye`, `greens`, `racing`) plus a
  correction to `done`, which still said "Whistle is yours".
  **They are directions, not transactions.** Wiz cannot open the stable script
  from a choice: `Dialogue._pick` (:280) runs `end()` after an `action` returns,
  so a dialogue started from inside a choice is closed by the same key press.
  The shop rows elsewhere in that file get away with it only because a *screen*
  is not a dialogue. **Do not "fix" this by having her call `say()`.**

## Task 70 (from lifetime 1) — still true, still verified

The rig, the animator, summon → mount → ride on `Digit6`, **11.00 m/s
sustained** matching `WorldMap.SPEED.chocobo`, the three-bird flock, the whistle
in `STARTING_ITEMS`, `orphans` green. See the git history: `13b7ff8`, `ce162a3`,
`5070a7f`, `9c35b9f`.

## What the frames showed (a look-loop subagent, lifetime 2)

Wiz Chocobo Post, `tmp/shots/l22hub/`: **it reads unambiguously as a farm post
at 80 m** — red board-and-batten barn with a navy gable, a banded feed silo, an
oval gravel apron inside a two-rail fence, hay bales, a tarp, a trough, a green
signboard. Four defects, **none of them in this lane's files**, all worth a
`TASKS.md` row:

1. **The red gable steps punch through the roof planes** — a saw-tooth of bright
   red tabs along both rakes, visible at 80 m, at every chocobo POI.
   `PoiKits._chocobo`'s `NG=5` gable boxes are not covered by the roof slabs.
2. **The paddock fence runs through the barn.** Barn centre is kit-local
   (−9, −11) with a 13×9 footprint, so its far corner is at radius **21.9 m**
   against a ring of `R = 20`.
3. **Hay bales float and intersect the tarp** — three of the six get
   `y = 0.9 + 1.6 = 2.5` with nothing beneath them.
4. The barn's sliding-door leaf takes a coarse straw-looking `M.plank` texture
   and reads as a bale stood on end; the 9 m side walls carry no battens.

The bird, `tmp/shots/l22bird/`: the **rump shingle fix worked** — overlapping
plates with thin dark-olive seams, no black slots, and not artichoked. The
**shoulder/fore-flank still spikes** into hard triangular tips. Two defects the
fix did not touch and which now dominate the read: **the thigh/hip masses are
two bald smooth spheres** butted onto the shingled flank with no transition, and
**the cream chest bib is a separate smooth egg** with a hard seam to the yellow
body, visible even at 3.4 m. The shank scutes read as rectangular tabs bolted on
with shadow under them.

## Known defects

1. ~~Dark gaps between the flank shingles on the rump~~ — **fixed in `52fe779`,
   not yet verified by eye.** The cause was structural: the rows step at a fixed
   0.34 rad and the vane width was authored per station, so the gap is
   `ROW_STEP * r` and grows with the barrel — 0.105 m of arc against a 0.092 m
   vane at the rump. The width is now solved for (16% overlap at every station)
   and the pitch falls off down the flank.
2. ~~The rider's left arm reads as flung out~~ — **fixed in `52fe779`, not yet
   verified by eye.** `POSE_RIDE` inherited `Occupants.POSE_DRIVER`'s numbers;
   a wheel is held at arm's width and a rein at hip's width. Roll and yaw on
   both upper arms halved. It read as the *left* arm only because that is the
   side the framing showed.
3. The breast down still reads as one smooth pale mass; it wants a few down
   feathers over it. **Not touched.**

## Not done / owed

- **`race_alpine` and `race_weaverwilds` have not been run.** `race_paddock`
  has, and won.
- **No frame of either hub has been looked at.** Specifically unverified:
  - whether the four hub prompts land on the apron rather than inside the barn,
    the silo or the paddock fence. Offsets are in `CHOCOBO_HUBS`
    (`wiz` stable +21/+11, board +31/+17; `alpine` stable +9/+5, board +15/−3),
    chosen so the three Wiz prompts — hers is at +26/+14 — never fight over one
    E press;
  - **whether the chocobo kit sits sanely on `meldacio_layby`.** It is a 40 m
    paddock ring plus a barn dropped onto what was a hairpin turning circle at a
    road junction. This is the highest-risk single change of the lifetime.
- **No perf number for the mount.** Lifetime 1 recorded a **measured negative**:
  `probes/chocobodraws.mts`'s two control arms read **589 and 489** draw calls
  four frames apart against a present arm of 397 twice — a drift of 100 against
  a delta of −142, which is not a result. Fix the settle (30+ frames, repeats
  with the spread reported, a null ablation) before quoting anything.
  `npcdraws`, `drawcheck` and `--perf` with the bird in frame are all still
  owed, and must be taken behind `daemon.mts --wait exclusive-free`.
- **Mount legality is coded but never exercised**: nobody has stood the bird on
  a 55° slope or at a lake edge and watched it refuse.
- **No `ControlsScreen` row** — see cross-boundary.

## Corrected anchors (the cold-start brief's were partly stale)

| brief said | actually |
|---|---|
| `src/characters/rig/RigBuilder.ts` | `src/characters/enemies/RigBuilder.ts` |
| `src/characters/enemies/CreatureAnim.ts` | `src/characters/rig/CreatureAnim.ts` |
| `src/game/Player.ts` | `src/characters/Player.ts` |
| "`KeyY` is free" | **`KeyY` is `RegaliaSystem.KEY.camera`** (`RegaliaSystem.ts`:91) |
| `Quests.ts:573` | `side_chocobo` is at `Quests.ts`:612 |
| `NpcDialogue.ts:463` | Wiz's script starts at `NpcDialogue.ts`:509 |
| `WorldMap.ts:611` | `meldacio_layby` is at `WorldMap.ts`:690 |

Free key codes, re-grepped: `Digit6`–`Digit0` only. This lane took **`Digit6`**.

Other verified anchors: per-vertex surface response is **`aMat`**
(`Sculpt.ts`:504), not GeoKit's `aSurf`. `Occupants.exit` early-returns on a
null `_saved`. `Ascension.awardAp('chocobo-distance', metres)` is gated on the
`ap-chocobo` flag from `exp_choco1`. **`AP_RULES` has no racing row** — use
`grantRaw`, which is documented for exactly this.

## The landmine this lane found (lifetime 1), kept because it is the best part

`75d8768` changed `mergeCreature`'s `skinWeight` row from `Float32Array` to
`Uint8Array` under a comment claiming the row was unreachable. It is reached by
**every creature in the bestiary**. Measured with
`src/tools/probes/skinweightblast.mts`: **23 of 23 species, 16,234 of 276,524
vertices (5.9%)** collapsing to the mesh origin. Reverted in **`ce162a3`**;
`skinweightblast.mts` is its regression test — keep it.

**How it was found is the reusable part**: rigid parts rendered perfectly and
blended parts collapsed to a point. That split is the fingerprint.

## Cross-boundary

- **FOR LANE 21 (`Shots.ts`)** — four framings, all `follow:` on the player so
  the rig re-anchors every frame (absolute framings drift):
  1. `chocobo_ride` — follow, offset ~`[0, 2.6, -6.4]`, lookOffset `[0, 1.4, 6]`,
     ridden at 11 m/s across open Duscae. Rider astride, four birds in formation.
  2. `chocobo_summon` — the 22 m run-in, framed from behind the player at eye
     height, so the arrival reads as an animal and not a menu.
  3. `chocobo_post` — Wiz Chocobo Post with birds in the paddock. **Now has
     something to photograph**: the dye stall and race-board prompts are live.
  4. `chocobo_portrait` — ~2.5 m, ¾ front, to carry the eye, crest and tack.
     The head sits **0.62 m forward of the root**; a framing aimed at the root's
     own xz at head height photographs the shoulder.
- **FOR LANE 10 (`ControlsScreen.ts`)** — this lane needs a **Chocobo** group:
  `6` whistle/dismiss, `E` ride, `Shift` sprint. Not landed, because the card
  already lies about several rows and lane 10 owns fixing them.
- **FOR LANE 1 / whoever re-attempts task 38:** a Uint8 skin-weight format needs
  the weights *scaled by 255* on the way in and `new BufferAttribute(arr, size,
  true)` on the way out. Written into `Sculpt.ts` beside the row.

## Instruments this lane built

- `probes/chocoborace.mts` — **the task-71 done-when.** Plays a course.
- `probes/chocobostage.mts` — six framings of the mount.
  `--set __MODE=stand|ride|gallop`, `--set __COLOUR=<key>`. The gallop mode
  drives the bird by wrapping `Input.update`; replacing `input.move` throws,
  because `Input.update` calls `this.move.set()` every frame.
- `probes/chocobodiag.mts`, `chocobodiag2.mts` — the skinning ablations.
- `probes/skinweightblast.mts` — per-species collapsed-vertex census.
- `probes/chocobodraws.mts` — refuses to print a draw cost when the control
  drift swamps the delta. It currently refuses. That is correct.

## Commits

Lifetime 1: `13b7ff8` the mount · `ce162a3` the cross-lane skinWeight revert ·
`5070a7f` the art pass · `9c35b9f` the starting whistle.
Lifetime 2: `5b76207` hubs, dyes, sylkis tiers, three courses · `bb5b420`
`side_chocobo` off the chapter gate · `ea5eea0` Alpine Stable re-typed ·
`193c130` Wiz's rows · `52fe779` the two frame-found defects + the race probe.
