# Lane W3-B — the camera, again

*Started 2026-08-31 from `c8da2aa`. The second blind playtest's #1 complaint,
for the third time: "the camera goes inside things, constantly, and when it does
I am completely blind."*

Two lanes have been here (`project/handoff/lane12a-camera.md`,
`project/handoff/rock-collision.md`) and between them closed the **boulder**
half: lens-inside-a-boulder 1.24% → 0.62%, chest-in-rock 41.92% → 0.00%. This
lane is the four cases that are **not** a boulder.

## The finding, which is not the arm and is not the terrain

The playtest's worst frame — "sprinting uphill the entire screen was a
featureless wall of brown dirt with moiré on it, no character, no horizon, no
landmarks; camera distance collapsed 5.2 m → 1.4 m" — **is not a collision
failure at all. The point the camera orbits was inside the hill.**

`probes/camsteep.mts` (new) drives the sprint and prints it at the frame in the
picture:

```
focus (-302.3, 44.0, -266.8)   ground under focus 46.2
armAt +0.00:1.10 +0.11:1.10 +0.22:1.10 +0.33:1.10 +0.44:1.10 +0.55:1.10
```

The velocity look-ahead walks the focus up to `lookAheadMax` = 2.2 m along the
direction of travel and the shoulder adds 0.55 m of the same; into a 40-degree
slope that is six metres of rise. `_armDistance` then sweeps outward from an
origin that is **already underground**, so its first step is a hit and it
returns `minDistance` — at every orientation, which is the second line. No arm
length and no pitch can escape a hill the orbit is centred inside. **Verified,
in a live page, at the exact frame that reproduces the complaint.**

## Landed

### 1. `focusClear` — the look-ahead is halved until the focus has air (`f1d0e87`)

Halving rather than clamping to the ground: raising the focus would float it
over Noctis' head, and it is the *offset* that is wrong, not its height. Four
halvings reach a sixteenth and the player's own chest is clear by construction,
so it terminates. `FOCUS_CLEAR` is 0.9 m of the 1.62 m the focus sits above the
feet.

**`probes/camsteep.mts`, 3 steep faces, the same start pose and the same held
keys both ways, 2520 frames each side** (`--build f1d0e87`):

|                                     | focusClear OFF | ON        |
|-------------------------------------|----------------|-----------|
| mean arm                            | 3.80 m         | **5.23 m**|
| arm crushed below 2.5 m             | 34.33%         | **3.37%** |
| lens clearance over the ground      | 2.17 m         | **3.53 m**|
| frame that is terrain within 6 m    | 0.364          | **0.114** |
| WALLED (no ray reaches 40 m)        | 32.94%         | 35.24%    |

Per site, arm crushed OFF → ON: 66.3 → 4.2, 18.1 → 3.6, 18.7 → 4.8.

**WALLED is the one column that does not improve, and it is honest to say why**:
site 1 is a 70-degree cliff face and the frame at its foot *is* the cliff, at
6–40 m. That is legible geometry seen at a distance, not mud on the lens, and
`frame within 6 m` 0.364 → 0.114 is the column that measures the difference.

### 2. `slopeLift` — pitch is the other degree of freedom (`f1d0e87`)

Behind a player on a 30-degree slope the ground rises 0.58 m per metre and a
0.22 rad arm rises 0.22, so the arm runs into the hillside at 2.5 m; at 0.6 rad
the same slope does not block the same arm at all. `_liftFor` searches five
lifts up to 0.55 rad for the smallest that gets 85% of the wanted arm, damped in
fast (3.5/s) and out slow (1.1/s). It is on the **orbit**, not a push:
`probes/camlook.mts` photographed a radial push-out turning a legible frame into
a wall of rock, and pitch is a direction the shot cares about.

**`probes/camview.mts --set __CV_ABLATE=slopeLift`, 3552 paired poses, 1312 on
ground steeper than 15 degrees:**

|                              | slopeLift ON | OFF     |
|------------------------------|--------------|---------|
| arm crushed below 2.5 m (steep) | **1.68%** | 10.59%  |
| mean arm (steep)             | **5.20 m**   | 4.77 m  |
| arm crushed below 2.5 m (all)| **0.70%**    | 4.34%   |

**The two instruments have opposite blind spots and this is worth writing down.**
The slope lift measures 6x on `camview`'s standing poses and did **nothing at all
live** until the focus clamp landed, because `camview` grades a standing focus
and has no look-ahead in it; `camsteep` drives a sprint and cannot see the
boulder work at all. Live, with `focusClear` on, the lift now fires on ~5% of
frames and reaches 8 degrees. It earns its place on standing/slow poses, and the
focus clamp is what carries the sprint. **Both verified.**

### 3. Creatures and the Regalia as dynamic occluders (`a18c26a`)

`CameraOccluders` knew only about boulders. Boulders do not move, so that window
is rebuilt twice a second; a car and a pack of animals do, so they are appended
after the boulders every frame in the same packed layout (`rockCount` /
`count`), behind `occluders.dynamic`.

They are **not** treated alike, and that is the design:

- **The Regalia** joins `data` and is swept by the arm like a boulder — a parked
  car is scenery. Its ellipsoid takes the authored 6.4 x 2.3 m body box's own
  half-extents, the largest ellipsoid lying entirely inside that box — see the
  numbers below, where the first, timider cut cost more than half the fix.
- **A creature is never swept.** Feeding animals to the arm is the regression
  this avoids: in a den fight four of them circle within two metres of the lens,
  so an arm stopping short of each is an arm pinned at `SOLID_MIN` for the whole
  fight — the exact frame lane 12a spent its lane escaping. A creature is a
  containment test, and the one animal the lens is *inside* is hidden for the
  frame. That is `Player.cullNearCamera`'s own argument applied to the other half
  of the cast, and it cites the same reason for hiding rather than fading:
  three's program cache key includes `parameters.opaque`, so animating
  `transparent` recompiles every program the creature touches.
- The restore runs at the **top** of `lateUpdate`, before the posed-shot branch
  can return past it — a creature left hidden into a `setShot` is a corpus frame
  with an enemy missing, and 166 of those are the `perf` gate.

`probes/camsolid.mts` (new) is the instrument, and both of its tests are
deliberately **independent of the rig's own geometry** — a box in the car's
heading frame and a capsule around each live enemy, both computed in the probe
and both fatter than the proxies the fix builds.

**The Regalia, 192 standing poses around the parked car** (4 rings x 4 pitches
x 12 bearings), Noctis with his back to it:

|                                    | dynamic OFF | ON        |
|------------------------------------|-------------|-----------|
| lens inside the car body           | 44.8%       | **9.9%**  |
| closest approach to the car centre | 0.56 m      | **1.18 m**|

The probe took three cuts to say anything, and the two nulls are worth keeping:
drive-and-exit is **0.0% both ways at 5.5 m** (`exit()` puts Noctis clear of the
door and `_first` re-seats the lens), and walking back at the car afterwards is
**0.0% at 8.8 m**. What reproduces it is standing beside the car — 5.6 m behind
a man three metres off the bumper is the inside of the bonnet — **and the pitch
matters more than the range**: at the resting 0.22 rad the lens rides 2.84 m
over Noctis' feet while the car's body centre is 0.95 m over its root, so it
clears the roof at every distance and the answer is 0.0% for a reason that has
nothing to do with any fix. Looking slightly *up* at the car, which is what you
do when you have just got out of it, puts the lens at bumper height.

The proxy was also a third smaller than it could safely be. An ellipsoid whose
semi-axes **are** the body box's half-extents is the largest one lying entirely
inside that box — it touches each face at its centre and misses only the
corners, so it can never stop the arm in open air beside the bonnet, which was
the whole fear behind the timid first cut. 2.5/0.95/0.62 → 3.2/1.15/0.75 took
19.3% to 9.9%. Every remaining failure is between the ellipsoid and the corners
of the box the probe grades with. **Verified.**

**Creatures**, `camsolid`'s fight rounds: over **3960 combat frames** across
three dens, the lens is inside a creature on **0.05%** and the fix hid one on
**0.10%** — i.e. the rig's ellipsoid fires slightly *more* often than the
probe's fatter cylinder, so the proxy is not too tight. A later 1320-frame
single-den run came back 0.00% on both, which is the den lottery both earlier
camera handoffs warn about. **The case is real and it is rare** — roughly one
frame in a thousand of combat, which is consistent with a player meeting it once
in half an hour. **I did not manage to photograph a pair where the hide visibly
changes the frame**: the two instants the probe caught were both marginal, with
the rig's ellipsoid and the probe's cylinder disagreeing at the corner. Not
verified by eye — flagged.

## Gates

All three gates the lane was told not to break, all green, all `--build HEAD`.

- **`gameplay`: PASS**, every segment ≥ 60 fps, `RULER_VALID: true`, **0
  hitches**, worst segment `streaming-traverse` 125.0 fps (8.0 ms). Noise floor
  1.05 ms = 22% of the median segment, so the box was not silent; the margin is
  large enough that it does not matter.
- **`combatloop`: 35/35 mechanics verified.** The dungeon round is unbroken —
  the Magitek Commander still arms on approach at 10.0 m and dies to the real
  damage path.
- **`perf`: PASS, 166/166 shots clear 60 fps by more than their own noise**,
  `RULER_VALID: true`, mean 193.9 fps, worst 114 fps (`lest_street_night`).
  Taken behind `daemon --wait exclusive-free`; noise floor 0.20/0.23 ms IQR, 6%
  of the reference shot's own frame. The posed path is untouched, as promised,
  and this is the number that says so.

The one cost worth naming, and it is in `camview`'s own table: with `slopeLift`
on, the mean fraction of the frame reaching the horizon falls 0.3665 → 0.3565
and WALLED rises 4.17% → 4.62%, because a lifted camera looks further down. That
is the price of the arm going 4.34% → 0.70% crushed, and it is worth paying — a
1.4 m arm is unplayable and a slightly steeper 5.2 m one is a normal shot — but
it is a real regression in one column and should not be buried.

## What the frames showed — looked at, not inferred

- **`tmp/shots/w3b/cs-s1-off.jpg` is the playtest's sentence, reproduced**: the
  entire frame a smooth blurred wall of brown dirt, no character anywhere, no
  horizon, no landmark, and the minimap a blank disc. Nothing but HUD.
- `tmp/shots/w3b/b/cs-s3-on.jpg` — the same probe with `focusClear` on: Noctis
  sword-drawn in the foreground, the party running up the rise, five voretooths
  on the crest with nameplates, sky, clouds, a mesa on the horizon, minimap
  populated. The OFF frame at the same instant reads `within 6 m 1.00, reaching
  40 m 0.00` — solid dirt.
- `tmp/shots/w3b/cs-s1-on.jpg` — the honest middle case: legible ground relief,
  shadows, grass, a rock outcrop, but the camera is looking steeply down and the
  character is clipped by the top of frame. Better than the wall it replaces and
  not yet a good shot.

## Left / next step

1. **The haven awning (playtest case four) is not done.** `HavenCamp` never
   touches the camera, so the letterbox is the ordinary gameplay arm walking
   into a kit mesh. The blocker is structural: `PartBuilder` emits **one merged
   mesh per material**, so a per-mesh bounding box at a haven is the whole camp
   and useless as a proxy. Doing it properly means triangles — a per-site
   triangle grid built on first sight and swept within an arm's length. See the
   residue entry.
2. **Player-mesh fade at a short arm** — still open, and still for the reason
   both earlier lanes gave. Note that `Player.cullNearCamera` already **hides**
   Noctis and any companion within 0.85 m of the lens, so the floor case is
   covered; what is missing is the transition between 0.85 m and ~1.5 m.
3. `camsteep`'s totals line prints `lift 0.0 deg` while the per-site lines print
   1.0–1.2 deg — a bug in the totals aggregation only, not in the measurement.

## Files

Owned and edited: `src/game/CameraRig.ts`, `src/game/CameraOccluders.ts`,
`src/tools/probes/camview.mts`, `src/tools/probes/camsteep.mts` (new),
`src/tools/probes/camsolid.mts` (new), `src/tools/_probe/w3bhaven.mts` (scratch).
Read only: `src/characters/Player.ts`, `src/characters/enemies/EnemyBase.ts`,
`src/world/vehicle/RegaliaSystem.ts`, `src/world/props/PoiKits.ts`,
`src/world/props/PartBuilder.ts`.

Commits: `e601f77`, `f1d0e87`, `a18c26a`, `82b82e6` (LANDMINES), `c644248`.

## Residue, ready to paste into `project/TASKS.md`

- **The haven awning (playtest case four) is not fixed.** `HavenCamp` never
  touches the camera, so the letterbox is the ordinary gameplay arm walking into
  a kit mesh — my case, not a shot. The blocker is structural and is now in
  `project/LANDMINES.md`: `PartBuilder` emits **one merged mesh per material**,
  so a whole haven is twelve meshes and a per-mesh bounding box is the entire
  camp. Doing it means triangles — a per-site triangle grid built on first sight
  and swept within an arm's length, cached against `BuiltSite.group` identity the
  way `RockField` caches against a stream cell. `CameraOccluders._dynamic` is
  where it would hang.
- **Player-mesh fade at a short arm.** Still open, and the earlier lanes' reason
  still stands: the materials are shared with the companions and are authored in
  another lane's `Cast.ts` / `rig/Materials.ts`. Two things changed tonight and
  both make it smaller. `Player.cullNearCamera` already **hides** Noctis and any
  companion within 0.85 m of the lens, so the floor case is covered; and the
  measured driver of short arms went 34.33% -> 3.37%, so the window between
  0.85 m and about 1.5 m where a dither would help is now rarely reached.
- **The creature case is real, rare, and unphotographed.** 0.05% of 3960 combat
  frames put the lens inside a creature and the fix fires on 0.10%. No pair was
  caught where the hide visibly changes the frame: both instants the probe
  stopped on were at the corner where the rig ellipsoid and the probe cylinder
  disagree. Re-run `camsolid` with more rounds and look.
- **`camsteep`s totals line prints a zero lift** while its per-site lines print
  1.0-1.2 degrees: a bug in the totals aggregation only, not in the measurement.
- **For the human, or `HUMAN_REVIEW.md`:** the slope lift trades horizon for arm.
  On `camview`s 3552 poses it takes the arm crushed below 2.5 m from 4.34% to
  0.70% and, in the same table, the mean fraction of the frame reaching the
  horizon from 0.3665 to 0.3565 and WALLED from 4.17% to 4.62%, because a lifted
  camera looks further down. I judged that worth paying — a 1.4 m arm is
  unplayable and a slightly steeper 5.2 m one is a normal third-person shot — but
  it is a real regression in one column, and somebody other than its author
  should look at a lifted frame and agree.
