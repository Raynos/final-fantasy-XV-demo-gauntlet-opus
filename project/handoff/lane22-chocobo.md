# Lane 22 — Chocobos (plan items 70, 71)

Status: **task 70 landed and verified. Task 71 landed: two of three races won
end to end by a probe, the third cut as a measured negative. Lifetime 3 took
`PoiKits._chocobo` over from lane 18 and fixed every defect the lifetime-2
frames had found, verified by eye; exercised the mount-legality refusals for
the first time; and moved the stable's prompts onto anchors the kit publishes.**
Lifetime 3 of an expected 4.

## Lifetime 3: what landed and what the frames showed

`PoiKits._chocobo` is **this lane's** now (lane 18 finished). Do not touch
`_town`, `_landmark` or `_imperial` in that file — they are in judged frames.

### The kit, four defects, all verified fixed by eye

Shots: `tmp/shots/l22kit/` (four bearings, 80 m, before the gateway fix) and
`tmp/shots/l22kit2/` (after). **Read `y315.jpg` for the current state**: a red
board-and-batten barn with a clean navy gable inside an unbroken two-rail ring,
a timber gateway with a hung nameboard on the road side, a banded feed silo, a
hay corner with a 3+2 bale stack and the tarp beside it, trough and signboard.

1. **The gable saw-tooth is gone.** It was five stacked boxes, each taking the
   triangle's width at the BOTTOM of its band and carrying it to the top, so
   every step stood `W/(2*NG)` = **1.3 m** proud of the rake and 0.14 m clear of
   the roof slab's upper surface — a row of bright red tabs along both rakes at
   every chocobo POI in the world. It is one `ExtrudeGeometry` triangle per end
   now, under the roof underside by 0.04 m at the ridge widening to 0.26 m at
   the eave.
2. **The fence no longer runs through the barn.** There is no seat for a 14.5 m
   barn *outside* a paddock that also fits inside a 22 m pad, so the barn is
   **inside** the ring: centre (−7, −5.8), far roof corner 17.9 m, ring 19.0,
   and `gradePad`'s wobbled edge comes no closer than `22*(1−0.085)` = 20.1.
3. **The ring has a way in.** Posts run one open arc; the 6.1 m it omits is a
   gateway aimed down the pad's own ramp (local +z).
4. **The bales stand on the ground.** Three at y 0.8 and two nestled at
   `0.8 + sqrt(1.6² − 0.9²)` = 2.12, not `0.9 + 1.6` over nothing.

Plus: the sliding-door leaf was `M.plank`, whose grain at 2.5 × 3.9 m reads as
straw, and is now a cream leaf with a Z-brace; the 9 m side walls carry battens;
and `_apron`'s three `wear` points are rotated into the pad's frame (they are
world-axis, the kit is yawed, so they were walking to yaw-0 positions).

**The gateway's first version was a football goal** — two cylinders and a thin
bar read as one from two opposite bearings (`l22kit/y225.jpg`, `y315.jpg`). It
is square-section posts, caps, knee braces and a nameboard now.

### The prompts are on the kit's own anchors

`_chocobo` publishes `stable`, `board`, `gate`, `yard` through
`KitResult.anchors`, and `ChocoboHub._reanchor` late-binds the two Wiz prompts
onto them. **Verified**: `chocoborace.mts` now reports both prompts at ground
**25.5 m** (the pad deck) where they used to read 24.9 (natural ground), i.e.
inside the ring on the apron rather than 23.7 and 35.4 m out on grass.
`meldacio_layby` is a `parking` kit and publishes nothing, so the Alpine
Stable keeps its offsets and the poll expires after 20 s. That is correct.

### Mount legality, exercised for the first time

`src/tools/probes/chocobolegal.mts`, verbatim:

```
WALKABLE_Y = cos(50 deg) = 0.6428; water level -6.50 m
swept 6561 points on a 95 m lattice: lowest -47.5 m, steepest n.y 0.108 (83.8 deg)
dry cold:    (-2038, 472) h=24.64 n.y=1.000 slope=1.6 deg -> canStandAt true
dry settled: (-2038, 472) h=24.64 n.y=1.000 slope=1.6 deg -> canStandAt true
dry: mountAt -> true, state away -> ridden bird at (-2038, 472)
wet cold:    (3325, 3325) h=-47.52 n.y=0.993 slope=6.8 deg WET -> canStandAt false
wet settled: (3325, 3325) h=-47.52 n.y=0.993 slope=6.8 deg WET -> canStandAt false
wet: mountAt -> false, state waiting -> waiting
steep cold:    (-665, 380) h=96.52 n.y=0.108 slope=83.8 deg -> canStandAt false
steep settled: (-665, 380) h=96.52 n.y=0.108 slope=83.8 deg -> canStandAt false
steep: mountAt -> false, state waiting -> waiting
```

Every candidate is measured cold and again after the player is teleported to
within 30 m and given 90 frames, because `Terrain.heightAt` answers differently
before and after the clipmap settles. They agreed at all three sites.

### Birds in the paddock

**Verified by eye** (`tmp/shots/l22kit5/near.jpg`, 40 m): three yellow chocobos
standing in the yard, well separated, and the place finally reads as a chocobo
post rather than as a farm with nothing in it. `_chocobo` publishes `bird0..2`
and `ChocoboHub._paddock` builds them at 150 m and drops them at 210 (the gap
is hysteresis), **gated on the camera, not the player**, because `PoiKits._make`
builds on camera distance and every free-camera framing would otherwise
photograph a built yard with an empty pen.

All three are yellow deliberately: `_prototype` memoises per colour and a second
colour is a second whole rig built as the player crests the hill. Their cost is
the lane's own measured 2.7 draws each — eight of 800.

The first placement put two of them 3.8 m apart and the frame caught the camera
along that line, so they overlapped into one two-headed bird. Nothing is now
closer than 7 m to another bird.

### `race_paddock` still wins after all of it

**23.67 s against a par of 27.** It was 21.75 against 25 until `startLine`
moved onto the kit's `gate` anchor — the actual gap in the fence rather than a
world-axis offset from the pin — which is a longer run to gate 1. **Par is set
off the measured perfect lap and never estimated**; 27 restores the 14% cushion
that 25 had against 21.75.

## The Alpine Stable: still cut, and the reason is not this kit

The lifetime-2 brief said "terrain-following placement plus a road-clearance
offset is the precondition for the Alpine hub existing". **After reading
`_apron`/`gradePad`, that framing is wrong and the item does not belong to
`_chocobo`.** `_apron` grades a *level deck* out to `r*(1±0.085)` and lays it as
geometry on top of the heightfield; inside that deck kit-local `y = 0` **is**
the ground, and a kit that dropped its parts to `Terrain.drawnHeightAt` would
put them under its own pad. What fails at `meldacio_layby` is upstream:
`_base` clamps the deck to within ~3 m of the pin, the batter reaches only `r`
further at 1:3 fill — about 7 m of drop over 22 m — and the terminus has 20–30 m
of relief across the kit's ring. A 22 m level deck cannot be produced there by
any change inside a kit function. **Residue for `_apron`/`gradePad`, not this
lane.** `race_alpine` stays cut (DNF 240.01 s, par 80, 59 m of relief across
five gates).

The POI's own `r` (48 at the layby, 200 at Wiz) is also **not** a defect: the
kit's whole envelope is 22 m and fits inside both. Scaling to `r` would give
Wiz a 200 m barn.

## Where to pick this up (the exact next step)

1. **The bird's sculpt** — two rounds landed this lifetime, the second not yet
   verified. Round 1 (`0d1a38c`) added hip coverts, bib down and a shoulder
   pitch falloff; a look-loop found **two of the three had missed, each by a
   radius**: the coverts were quilled 0.055 from the thigh's *centreline* while
   its outer surface is at 0.355, so they hung inside the leg, and the shoulder
   falloff overshot into "a plain smooth yellow blob with essentially no feather
   read at all". Round 2 (`da354da`) puts the coverts at 0.17, raises the pitch
   floor to 0.13 with a 0.06 alternating tone step, and — a defect the look-loop
   found on its own — moves the **stirrup leather and iron from x 0.350 to
   0.435**, because the barrel's radius there is 0.37 and the iron was reading
   as "a black C arc painted on the flank" in every side and rear frame.
   **Re-shoot and check round 2.**
2. **The rider's arms: the pose table is exonerated and the cause is named.**
   `POSE_RIDE` is mirror-symmetric (`Skeleton.ts`:154 mirrors bone *translation*
   only) — and a look-loop at close crop reports that **one hand mesh is a
   closed black glove and the other a bare open hand**, so a symmetric pose
   still renders asymmetric. The far hand also sits at chin height over empty
   air while both reins droop unheld from the bit to the withers. So there are
   two separate items and neither is `POSE_RIDE`: (a) the hands are not the same
   mesh — find out whether that is the party rig or a *second rider* from the
   flock caught in the crop, which was hypothesis (b) all along; (b) nothing
   holds the reins, which is a rein-attachment problem, not a pose one.
3. `M.cloth` is a navy canvas and the hay tarp reads as a dark blue tent. Shared
   material, six kits use it; needs a hay-tarp colour or the tarp dropping.
4. **Grass punches through the gravel apron** at Wiz in every bearing — green
   blotches all over the pad. That is `Ecology.poiClear`'s plateau-plus-skirt,
   which `PAD_R`'s docstring in `PoiKits.ts` describes and assigns to the
   vegetation lane. Not this lane's, and very visible.

### The mount's draw cost, measured, and the confound that hid it

Taken behind `daemon.mts --wait exclusive-free`, which reported
`exclusive-free after 0.0 s` — **the tree was quiet.**

```
per-frame census over 200 frames: 392..608 calls, 99 spike onsets, gaps 2,2,2,...
null ablation (nothing toggled): 473.8/475.3/475.4/475.3 (mean 474.9, spread 1.6)
away    463.9/463.7/465.3 (mean 464.3, spread 1.6)
present 473.5/475.3/476.2 (mean 475.0, spread 2.7)
MOUNT + FLOCK COST 10.7 DRAW CALLS (2.7 per bird), against a bar of 5.4
frame with the bird present: 476.2 draw calls (BRIEF budget 800/shot)
```

**The old probe was not drifting; it was aliasing.** The shadow cascades
refresh on a **2-frame** schedule (the census measures it) and a read was
`SETTLE + 1` = 31 frames, so an A/B pair was 62: every `away` read landed on
the refresh phase and every `present` read on the quiet one, in every repeat,
for ever. That is why the two arms were individually *tight* (589/488/589/490
and 395/393/396/396, spread 3) while the null ablation spread 213, and why two
independent runs both produced about **-143**. Two runs agreeing is what a
systematic error looks like. A read is now the mean of **120 consecutive
frames** -- 60 full periods -- and the null spread fell from 213 to 1.6.

So: **the mount and its three-bird flock cost 10.7 draw calls, 2.7 each, and a
ridden frame is 475 of a budget of 800.** Wiz Chocobo Post from four `dresscam`
bearings reads 404-545 calls, also inside budget.

## Not done / owed

- `npcdraws` needs a `Shots.ts` framing with the bird in it and **lane 3/21 owns
  `Shots.ts`** -- the four framings this lane wants are in the cross-boundary
  list below and have not landed. The draw question it would have answered is
  answered above by `chocobodraws`, which does its own ablation.
- **No `ControlsScreen` row** — see cross-boundary.

## Corrected anchors (the cold-start brief's were partly stale)

| brief said | actually |
|---|---|
| `src/characters/rig/RigBuilder.ts` | `src/characters/enemies/RigBuilder.ts` |
| `src/characters/enemies/CreatureAnim.ts` | `src/characters/rig/CreatureAnim.ts` |
| `src/game/Player.ts` | `src/characters/Player.ts` |
| "`KeyY` is free" | **`KeyY` is `RegaliaSystem.KEY.camera`** (`RegaliaSystem.ts`:91) |

Free key codes, re-grepped: `Digit6`–`Digit0` only. This lane took **`Digit6`**.
Other verified anchors: per-vertex surface response is **`aMat`**
(`Sculpt.ts`:504). `Occupants.exit` early-returns on a null `_saved`.
**`AP_RULES` has no racing row** — use `grantRaw`.

`PoiKits` anchors: `PAD_R.chocobo` is 22 and `Ecology.ts` reads that table, so
changing the apron radius changes the vegetation clearing too. `gradePad`'s deck
edge wobbles `r*(1±0.085)`. `anchorAt` allocates a fresh `Vector3` per call and
returns `null` until `_make` has built the site.

## Task 71 / task 70: what landed (unchanged from lifetime 2)

Two stables in `CHOCOBO_HUBS`; dyes at Wiz only (`DYE_PRICE`); four sylkis
tiers that raise sprint and tank and **never** cruise, because cruise is
`WorldMap.SPEED.chocobo` and the map's ETA table is priced on it; two authored
courses with pars set off the *measured* perfect lap; `side_chocobo` re-keyed to
quest state with no chapter and no POI `gate:` field; three Wiz dialogue nodes
that are **directions, not transactions** (`Dialogue._pick` :280 runs `end()`
after an action, so a dialogue opened from a choice closes itself — do not "fix"
this by having her call `say()`).

Task 70: the rig, the animator, summon → mount → ride on `Digit6`, **11.00 m/s
sustained**, the three-bird flock, the whistle in `STARTING_ITEMS`.

## The landmine this lane found (lifetime 1), kept because it is the best part

`75d8768` changed `mergeCreature`'s `skinWeight` row from `Float32Array` to
`Uint8Array` under a comment claiming the row was unreachable. It is reached by
**every creature in the bestiary**: **23 of 23 species, 16,234 of 276,524
vertices (5.9%)** collapsing to the mesh origin (`probes/skinweightblast.mts`).
Reverted in `ce162a3`; that probe is its regression test — keep it.
**How it was found is the reusable part**: rigid parts rendered perfectly and
blended parts collapsed to a point. That split is the fingerprint.

## Cross-boundary

- **FOR LANE 21 (`Shots.ts`)** — four framings, all `follow:` on the player:
  `chocobo_ride` (offset ~`[0, 2.6, -6.4]`, lookOffset `[0, 1.4, 6]`),
  `chocobo_summon` (the 22 m run-in from behind the player at eye height),
  `chocobo_post` (Wiz, which now has a gateway, a hay corner and live prompts),
  `chocobo_portrait` (~2.5 m, ¾ front — the head sits **0.62 m forward of the
  root**, so a framing aimed at the root's xz photographs the shoulder).
  Without one of these, `npcdraws` cannot be run with the bird in frame.
- **FOR LANE 10 (`ControlsScreen.ts`)** — a **Chocobo** group: `6`
  whistle/dismiss, `E` ride, `Shift` sprint.
- **FOR `_apron` / `gradePad`'s owner** — see the Alpine section above: a level
  deck cannot be produced on 59 m of relief and six kits inherit the problem.
- **FOR LANE 1 / task 38:** a Uint8 skin-weight format needs the weights
  *scaled by 255* in and `new BufferAttribute(arr, size, true)` out.

## Instruments this lane built

- `probes/chocoborace.mts` — the task-71 done-when. **Plays** a course.
- `probes/chocobolegal.mts` — the refusals, with a dry control and a
  cold-vs-settled read at every site.
- `probes/chocobodraws.mts` — the mount's draw cost, with a null ablation.
- `probes/chocobostage.mts` — six framings of the mount.
  `--set __MODE=stand|ride|gallop`, `--set __COLOUR=<key>`.
- `probes/skinweightblast.mts` — per-species collapsed-vertex census.

## Commits

Lifetime 1: `13b7ff8` · `ce162a3` · `5070a7f` · `9c35b9f`.
Lifetime 2: `5b76207` · `bb5b420` · `ea5eea0` · `193c130` · `52fe779`.
Lifetime 3: `653a0e3` the kit's four frame-found defects · `3dfb43c` the
gateway and the tarp · `76096bb` `chocobolegal.mts` · `3ac09cb` the prompts
onto the kit's anchors · `353b843` `chocobodraws`' settle · `a800bb5` the
phase fix and its numbers · `0d1a38c` the three sculpt seams (**not yet
verified by eye**) · `3d8a760` + `9423058` birds in the paddock (**verified**)
· `da354da` the sculpt again after a look-loop (**not yet verified**) ·
`529be22` bird spacing and the gateway's blank slab · `08e8f91` the start line
onto the gateway · `f51ce0b` stalls behind the barn door and par 25 -> 27.
