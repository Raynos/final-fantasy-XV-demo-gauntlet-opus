# Lane 23 — Swimming and diving

Plan: `docs/plans/2026-08-30-fable-to-nine.md` items **72** (surface swimming)
and **73** (diving). Sized 3–5 lane-lifetimes; this is lifetime **1**.

Owns `src/world/swim/**`, `src/world/collision/CharacterController.ts`,
`src/world/Water.ts` (inherited from lane 7, which finished), and
`src/tools/probes/nanunder.mts`. Cross-lane: two lines in `src/game/Game.ts`
(the registration and the registry keys), landed in the same commit.

## Commits, in order

```
f580459  CharacterController swim branch + Swim.ts + Underwater.ts + Game.ts registration
2e75613  probes/nanunder.mts -- the from-below NaN instrument, and its baseline
9b39b41  Water.ts from-below branch (Snell window + TIR mirror + distance murk);
         Underwater keyed off the CAMERA; probes/swimcross.mts
09e7a46  probes/divebreath.mts, probes/shotswim.mts, guarded normalize in the branch
2904a6e  murk tint derived from Water's own uScatter; swimcross sample rate
e432365  murk ramps across the waterline instead of switching on at it
cfd516d, ac6112d  this handoff
139d0af  project/TASKS.md residue rows
```

Both typechecks, the build and the four `pre-commit` gates are green on every
one of them. **`pnpm run check` was not run — the coordinator owns the suite.**

## Status

| task | state |
|---|---|
| 72 surface swimming | **landed and measured.** 167 m swum at Alstor, floor-walk 2/3287 samples, head 0.48 m clear throughout, exit under control. `longplay` NOT run. |
| 73 diving | **landed and measured.** 9.76 m eye depth, breath to zero, forced ascent against a held dive key, 0 NaN on both underwater framings. Murk **looked at twice** and fixed twice. |

## What landed, and why it is shaped this way

**`f580459`** — four files.

- `CharacterController.swim` / `swimY` / `swimRate` + `_swimStep()`. The branch
  is *here* and not in the swim system because `vy` is the single vertical
  integrator and `move()` subtracts 19.5 m/s² from it unconditionally. Two
  writers of `pos.y` race every frame: sink a frame of gravity, get hauled back
  — 3 mm at 60 fps, 5 cm on a long frame, a visible bob. Gravity and buoyancy
  have to be the same `if`.
  - horizontal half is **verbatim**, so walls still stop a swimmer;
  - no slope response (a bed normal means nothing to something not touching it,
    and a steep silt slope would read as a current);
  - the bed is a **floor** (`pos.y` clamped up out of it), not a support, so a
    dive can rest on the bottom without being re-grounded and walked home;
  - `grounded` stays **true** — it means "held up by something", and a swimmer
    is; publishing false puts Noctis in a falling pose mid-lake.
  - buoyancy is first-order on the position, differentiated back into `vy`. The
    spring-on-`vy` form overshoots and dunks the swimmer's own head per entry.
- `world/swim/Swim.ts` — the state machine, on the **`Occupants.enter`
  pattern**: save every field, overwrite, run in `lateUpdate`, restore in one
  place. Zero edits to `src/characters/`, `src/ui/`, `PostFX.ts`, `Sky.ts`.
  Takes over: `player.terrain = NO_GROUND` (kills foot IK), `walkSpeed 2.2` /
  `runSpeed 3.4`, `combat.scenarioLock = true` + `weapon.setReveal(0)`,
  `party.members[].speedMul = 0`.
- `world/swim/Underwater.ts` — murk + breath gauge.
- `game/Game.ts` — `step('Swim')`, `step('Underwater')` after Chocobo/Camera,
  before Audio, and the two registry keys.

### Decisions worth not re-litigating

- **Where the water is: `WaterMask.levelAt` only.** It covers the four
  flood-filled basins, the tarns *and the drawn river sheet*;
  `Water.surfaceAt` covers only the body AABBs. `water/WaterMask.ts` opens with
  the essay on why a fifth private copy of "is this wet?" is the bug class.
  **This is also why lane 7's empty `Water.riverJoins` does not block this
  lane** — see Open questions.
- **Depth is `level − CollisionWorld.groundAt().y`**, not `Terrain.heightAt`,
  so a swimmer over a sunken deck is in the water above the deck.
- **Hysteresis 1.2 m in / 0.85 m out.** It has to be that wide: the entry test
  is at the feet, a swimmer's feet float 1.30 m down, so one threshold sits on
  a knife edge in the last two metres of every beach and flickers at frame rate.
- **The party is pinned to the bank in `lateUpdate`.** `Party.update`
  teleports a companion more than 100 m adrift straight to their formation slot
  in the player's frame — 150 m out into Alstor Slough that is open water. There
  is **no lever to disable it from outside**; there is a lateUpdate that runs
  after it. (Checked: `Party.ts:410`, `dist > 100 && !inCombat && !m.downed`,
  the 55° cone.) Overwriting the position afterwards is the whole trick.
- **The murk is the shared aerial-perspective fog repointed**, exactly as
  `Dungeons._applyInteriorAtmosphere` does for a cave — `uSkyDim = 0`,
  `uNight = 1`, `uNightTint` = the water colour, and the shared height-fog
  integral in `sky/MaterialPatch.ts:185` becomes depth-correct murk on every
  patched material for free. No PostFX pass; that chain is lane 15's file.
  Two deviations, both physics:
  - **homogeneous, not exponential-with-height**: `uFogBase` pinned to the
    *camera* and `uFogHeight` to 1e5, so `y0 = 0` and the integral collapses to
    `density × distance`. Pinning the base to the water level (tried first)
    makes the murk *thinner* the deeper you go, because the term is an
    atmosphere and atmospheres thin upward.
  - **the sun stays on**: a dungeon kills the cascades because no sun gets in;
    sun very much gets into the first ten metres of a lake.
  `Sky.update` rewrites those uniforms every frame, hence lateUpdate and an
  unconditional write while submerged rather than a one-shot on entry.
- **Breath**: 26 s submerged, refill 4.5 s, forced ascent at zero that ignores
  the dive keys until the head is out and `breath > 0.18`. Dive = Ctrl or gp(1),
  ascend = Space/E or gp(0). Space is safe because combat is `scenarioLock`ed.
- **`reset()` on both systems.** A reused capture page must not start a shot
  mid-stroke with the party pinned to a bank on the far side of the world.

## The first two frames ever taken from under a water surface

`tmp/shots/l23/base/`, at `f580459` — **read by eye, verified**. Both are the
predicted failure and then some:

- **`under_vesper.jpg`** (7.0 m under the Vesperpool) is a **pure white flare
  across the whole top of the frame**, blooming, with the grass below it in
  bright unattenuated daylight green. Diagnosis: from below `V` points down, so
  `H = normalize(uSunDir + V)` lines up with `N` over most of the ceiling and
  the `spec * 2.4` glint — a term whose whole job is to be a narrow glitter
  road — becomes a full-screen light.
- **`under_alstor.jpg`** (5.3 m under Alstor) is a **dark navy ceiling with grey
  clouds and green tree-blobs pasted on it**, over a crisp, dry, fully-lit
  rockfield and green sward. Two separate defects in one frame:
  1. `fres → 1` because `dot(N, V)` is negative, so the fragment is 100% planar
     reflection — and that target is not even refreshed down there
     (`_shouldReflect` bails at `cam.y < level`), so it is a **stale mirror of
     the sky, on the ceiling, at full strength**;
  2. **no water between the lens and the world at all.** The murk was keyed off
     the *player swimming*, and an authored underwater framing has no swimmer
     in it.

Both are fixed in **`9b39b41`** (Snell's window + TIR mirror + distance murk in
`Water.ts`; camera-depth keying in `Underwater.ts`). **The fix has not been
looked at yet** — `tmp/shots/l23/w1/` was captured at `63f77f6d` with the shader
change still uncommitted, so it is a picture of the OLD shader. Re-shoot at HEAD.

Also measured at `f580459`, both **verified**:
- `nanunder`: **0 NaN, 0.00% black** on both framings, before any from-below
  work. The predicted `refract`-TIR / zero-vector NaNs are not being hit.
- **8/8 body meshes visible from below** — `Water._visible`'s `level - 2` slab
  does *not* cull the surface from underneath, which was an open question.
- The camera clamp left both framings alone: they resolved 5.28 m and 7.00 m
  below the water level.

## What the fixed frames show — `tmp/shots/l23/w3/`, at `3c59927`, READ BY EYE

**Both are now recognisably underwater, and this is the third look; the first
two were wrong in different ways.**

- **`under_vesper.jpg`** — a dark rippling ceiling with bright window openings
  scattered across it where the wave normals tilt far enough to break total
  internal reflection, over a mid-tone teal bed, with the far water going black
  before the bed does. The white flare is **completely gone**.
- **`under_alstor.jpg`** — teal-lit boulders in the near field losing contrast
  into the murk behind them, a dark ceiling with cyan window flecks and cloud
  shapes showing through the largest of them. It reads as a lake bottom.

**Honest residue in those frames**, none of it a bug, all of it polish:
1. the near boulders are brighter and more contrasty than the bed and do not
   attenuate with range as fast as they should — a slightly "lit diorama"
   near field;
2. the far bed meets the dark far water on a **hard horizontal line** with no
   transition band;
3. the whole thing reads closer to a night dive than a midday one. The TIR
   mirror is `uScatter * downwelling * 1.55`, which is deliberately dark, and
   the exposure clamp takes it down further. At the grazing angle these two
   framings use, dark is physically correct — but a shallower framing would
   show more of the window, and no such framing has been taken.

## Not verified

- ~~`longplay` and `gameplay` were never run~~ — **both ran in lifetime 2 and
  both PASS.** The quiet lane did free up: `gameplay` took it at 01:47 and
  `longplay` at 01:55 behind `daemon.mts --wait exclusive-free --for 900`.
  Numbers in the lifetime-2 section at the foot of this file. **Task 72's
  done-when is complete.** (The lease hazard the old note describes is also
  retired — `src/tools/README.md` now records that `/exclusive` queues behind
  live leases instead of closing them, and this `longplay` survived a
  `coldload` taking the lease while it ran.)
- ~~`shotswim.mts` never returned~~ — **it did, and the answer is clean:**
  `[shotswim] 0 of 162 shots stand in water; 0 engage the swim state`, at
  `4af4d26`. **No corpus frame changes because of this lane.** The cross-lane
  risk is retired; re-run it only if `Shots.ts` gains a water framing.
- The breath gauge's DOM has never been in a frame — it only draws while
  swimming, and no capture has had a swimmer in it.
- Older, superseded notes below.

### Superseded — what was unseen before the third look
- that the swim state actually engages at Alstor;
- **the water surface from below**. Lane 7 confirms every framing it ever took
  was from above, and predicts the from-below fragment is wrong in four ways at
  once (`fres → 1` so 100% of an above-water planar reflection is pasted on the
  ceiling; `refract` TIRs to `vec3(0)`; `down = max(-R.y, 0.10)` makes the path
  10× the depth so `T → 0`; the `fres*0.92` alpha floor makes the underside 92%
  opaque at a grazing angle). **The `gl_FrontFacing` branch is not written.**
- the murk's colour and density;
- the breath gauge's placement.

## The numbers — both done-whens measured, VERIFIED

`swimcross` and `divebreath` at `396eb42` (HEAD at the time, quiet-ish tree —
the exclusive lease was free, 4 workers busy, so these are gameplay-loop
trajectories rather than perf numbers and contention does not affect them).

### Task 72 — `swimcross`, Alstor bank at (−961, 745), level −6.5

```
entered   true at depth 1.21 m        (threshold 1.2)
swum      167 m,  max depth 6.45 m
floorWalk 2 of 3287 samples  (0.06%)
headUnder 0 frames           minHeadClear 0.48 m
exited    true at depth 0.85 m,  stillSwimming false
nan       0
```

Read that as: **the floor-walk is gone.** The defect's signature is feet within
15 cm of the bed under more than 1.4 m of water, and it fires on 2 frames out
of 3287 — both at a state-machine boundary, where the depth crosses 1.4 m in
the same frame the feet are still on the bottom. `minHeadClear` is **exactly**
`height 1.78 − FLOAT 1.30 = 0.48` and never moves, and the track holds
`y = −7.80` for the whole 167 m: buoyancy pins the swimmer to the water line
through 2 m to 6.45 m of water without a single bob. `headUnder = 0` — a
surface swim never accidentally submerges.

### Task 73 — `divebreath`, deep Alstor, dive key held for 45 s

```
maxEyeDepth   9.76 m       maxDive 10.13 m
camUnder      2492 of 3180 frames      framesSubmerged 2562
minBreath     0            breathHitZero true
forcedAscent  550 frames   surfacedAgain true, 235 frames (3.9 s) after zero
nan           0            on release: back to y = -7.80, breath 1.000
```

**The forced ascent is not negotiable, and this is the measurement that proves
it**: `ControlLeft` is held down for the entire 45 s, and at the breath limit
the swimmer rises from 8 m to 1.8 m of eye depth *against* the key and breaks
the surface 3.9 s later. Breath then refills, the held key takes him back down,
it drains again, and the cycle repeats stably — the phase table shows two full
descend/drain/force/surface cycles. The camera goes under with him (2492
frames), which is the other half of it: a dive that only lowers the feet leaves
the lens in the air and nothing underwater is ever drawn.

## Exact next step## Exact next step

1. Read `tmp/l23/*.jpg` from the first `framecam --probe` run of
   `src/tools/probes/nanunder.mts`'s framings (the probe derives them; it does
   not shoot — `probe.mts --shot` returns black, filed tonight). Run
   `node src/tools/probe.mts src/tools/probes/nanunder.mts` for the NaN number
   and `framecam --probe` for the picture.
2. Write the `gl_FrontFacing` branch in `Water.ts`'s lake fragment: Snell cone
   (~48.6°) showing the compressed sky disc, mirrored underwater scene colour
   outside it, alpha from viewing angle. **Do not undo lane 7's freshly-tuned
   `sUv += N.xz * (0.004 + 0.030*calmFar)`** — it is the fix for the shredded
   Vesperpool reflection.
3. Drive a real swim across Alstor in `gameplay`, then `longplay`.

## Instrument traps (inherited, all filed tonight)

- `shoot.mts --post` never reaches the page — use `--extra post=...`.
- `probe.mts --shot` returns **black**. Use `framecam --probe`, which injects
  into `SHOTS` and screenshots on the corpus path.
- `--build <sha>` is **not** a bisect here: `src/public/baked/` is one shared
  directory symlinked into every materialised tree, so it pins code, not content.
  Hence `nanunder` derives its framings from `Water.bodies` live.
- `nanscan` command line in the plan is wrong repo-wide: it is a probe body —
  `node src/tools/probe.mts src/tools/probes/nanscan.mts`.

## The biggest remaining visual gap: he swims in a walk cycle

**Not fixed, deliberately, and not blind-fixable.** `Player.update` calls
`character.update({ speed: this._gait, ... })` *inside* its own `update`, before
any `lateUpdate` this lane runs, so the gait a swimmer is animated with is the
ordinary locomotion gait. A person crossing a lake plays a walk cycle with their
legs under the water.

Two zero-edit levers exist and **neither has been looked at, so neither is
landed**:

1. **Pitch the root.** `Occupants` already overwrites `root.rotation` from
   `lateUpdate` for seated poses, so a ~25° forward pitch on `player.root` while
   `swimming` is available with no `src/characters/` edit, and an upright
   figure going forward at 2.2 m/s is the single most obviously wrong thing in
   the feature.
2. **Hold the gait near idle.** `_gaitWant = speed * body.progress`, and
   `progress` is produced by `CharacterController._score`, which this lane owns.
   Reporting a reduced progress while swimming would settle the legs toward the
   idle pose — closer to treading water than to walking. But `progress` also
   scales the velocity the party chases, so it is not free.

A real answer is a **swim stroke in the rig**, which is `src/characters/`
(lanes 1/2/22). Filed below as a `TASKS.md` row.

## Open questions / cross-lane

- **Lane 7's empty `Water.riverJoins`, diagnosed, not fixed.**
  `River.ts:778` is `if (tk < 0) continue;`, and `trunkOf[a]` is only ≥ 0 when
  a reach's first half passes within `hw[i] + th[bj]` of an already-accepted
  reach (`River.ts:571-583`) **and** does not land in the last
  `minJoinRun ?? 90` m of it (`:594`, "two reaches meeting end to end at the
  sea is not a confluence"). With 9 reaches all running to the same sea, all
  nine landing in that end-of-trunk window is entirely plausible and is **not
  necessarily a bug**. `stats.confluences` is the number that settles it — if
  it is 0, the routing genuinely found none; if it is > 0 and `joins` is empty,
  *then* it is a bug. One probe line. **Not blocking lane 23**: swimming reads
  `WaterMask`, which indexes the drawn river sheet directly.
- **Corpus risk to flag to the coordinator / lane 21:** if any existing shot
  poses the player in > 1.2 m of water, `Swim` will now engage in that frame and
  pin the party to the bank. Not yet measured. The check is one probe over
  `SHOTS`: `applyShot`, then read `game.get('Swim').depth`.
- **Underwater framings for lane 21 to author into `Shots.ts`.** Resolved
  against the live bake at `f580459` and confirmed genuinely under the surface
  (the `heightAt + 1.35` shot clamp did not lift either):

  ```
  under_alstor  pos [-1355, -11.78, 745]    target [-1309, -6.28, 775]   fov 58
                5.28 m under the level, bed 11.72 m down
  under_vesper  pos [-2940, -13.50, -2280]  target [-2894, -4.50, -2250] fov 58
                7.00 m under the level, bed 15.55 m down
  ```

  Both are `time: 11.5, weather: 'clear'`. Prefer re-deriving them with
  `src/tools/probes/nanunder.mts` rather than pasting the numbers: the probe
  walks rings out from a seed until it finds the deep point, so it survives a
  bake that moves, and it reports where the lens *actually* ended up.

## Harness notes for whoever picks this up

- The queue was 60% of all harness wall-clock during this lifetime
  (`harnessstats`: 1084 jobs, waited 2226 m, ran 1463 m; prewarm alone 1344 m
  of wait). **Every commit costs a prewarm**, so batch commits when a capture
  is queued behind them, and do not launch four probes at once as I did.
- `framecam --probe src/tools/probes/nanunder.mts` gives the NaN report *and*
  both pictures from one boot: the probe returns `specs` as well as its report,
  so `probe.mts` reads the number and `framecam` shoots the same derivation.

## Lifetime 2 (2026-08-31, 01:15–02:10) — verification, and one experiment reverted

**Two lane-23 agents ran at once tonight.** This lifetime was spawned from the
`47af406` handoff while lifetime 1 was still alive, so `swimcross`,
`divebreath`, the underwater re-shoot and `shotswim` were all run twice on
separate boots. That is worth keeping rather than apologising for: every
headline number in this file now has an **independent reproduction**.

| measurement | lifetime 1 | lifetime 2 (separate boot) |
|---|---|---|
| `swimcross` | entered@1.21 m, 167 m, maxDepth 6.45 m, **floorWalk 2/3287**, exited@0.85 m, minHeadClear 0.48 m, nan 0 | **identical, field for field** |
| `divebreath` | eyeDepth 9.76 m, breath→0, forced ascent 550 f, surfaced 235 f later | phase table reproduces: f2340 depth 8.09/breath 0.09; f2520 breath 0 **forced**; f2700 depth 0.42 still forced; release → y −7.80, breath 1.000 |
| `shotswim` | 0 of 162 shots wet, 0 engage | **0 of 162, 0 engage** |

### The Snell band — measured, reverted, filed

At 4x the `under_alstor` ceiling resolves into grey cloud shapes and
**hard-edged mint-green foliage blobs**: the world above the water showing
through. The arithmetic says that should not be possible in these two
framings. Both look up at ~38° of elevation, so every ceiling pixel is ~52°
off vertical — wholly outside the 48.6° cone — yet
`win = smoothstep(0.575, 0.715, ci)` returns **0.29** at `ci = 0.616`, because
the band straddles the critical angle instead of starting at it.

Narrowed to `smoothstep(0.660, 0.706, ci)` and re-shot. Two findings, both
negative:

1. **The A/B was confounded.** `3c59927` (the exposure clamp) landed between
   the two captures, so the second frame was 2.3× darker for a reason that had
   nothing to do with the band. Measured, on the frames:

   ```
                     ceiling mean RGB        bed mean RGB       bed luma
   w2 alstor (pre)   0.082 0.196 0.244       0.320 0.568 0.623     0.519
   w3 alstor (post)  0.028 0.049 0.074       0.076 0.260 0.325     0.226
   ```

2. **The mint blobs survived the narrowing.** They are not sub-critical leak;
   the wave normal tilts far enough on those facets to open a real window,
   which is what a choppy surface does. Narrowing only made an
   already-night-dark midday dive darker, against this file's own residue note
   (§ "reads closer to a night dive than a midday one"). **Reverted. The tree
   is unchanged and `Water.ts` is back at HEAD.**

Also measured while looking: **nothing clips in either frame** —
`frac > 0.98 in any channel` is 0.0004 (w2) and 0.0 (w3), and w2's bed p95 was
(0.51, 0.66, 0.72), a mid cyan. The pre-clamp "swimming pool" read was never
blown highlights; it was the value structure — a bright floor under a dark
ceiling — and the clamp is what fixed it.

**The clean A/B, taken afterwards.** `w3` was re-shot at HEAD with the band
reverted, into the same directory, and the two frames agree **to three decimal
places in every channel** (`top 0.028 0.049 0.074`, `bot 0.076 0.260 0.325` on
alstor, both times). The band is not the lever on these framings. Measured
negative, closed.

### `gameplay` — PASS

Run at `sha:2cc03008dc65`, and the tool's own contention check says
**CONTENDED**: *"another lane is running coldload, drawcheck, framecam, probe,
sheet, shoot, texbake"*, load 4.00 over 18 cores. The verdict survives that by
a factor of two, so it is reported rather than re-run:

```
worst segment: streaming-traverse at 120.5 fps   total hitches: 0
noise floor 0.78 ms = 16% of the median 4.8 ms segment
RULER_VALID: true
PASS: every segment >= 60 fps, on a ruler that validated itself
```

Every one of the thirteen segments is at or above 120 fps, `>16ms` is 0% on
eleven of them and 3% / 1% on `streaming-traverse` and `day-night-sweep`. The
swim systems run in `lateUpdate` on every frame of that and cost nothing
visible.

### `longplay` — PASS. **Task 72's done-when is now complete.**

`node src/tools/probe.mts src/tools/probes/longplay.mts --ttl 40 --turbo 10`,
taken behind `daemon.mts --wait exclusive-free --for 900` (the lease was held
by a co-agent's `coldload` when it was launched, and it waited). At
`sha:b742847b585e`; queued 160.8 s, ran 151.7 s behind 31 prewarms.

```
30 game minutes cost 10.7 min of wall clock (168 sim frames/s)
travelled 10.79 km · encounters 15, victories 15, kills 70
forage taken 80 · distinct prompts 16 · in combat 5.6% of frames
JS heap per minute, MB: 842 x30      <- flat, no leak over 30 game minutes
all 13 wedge checks ok (fights start and end, forage keeps coming, quest log
still has 3 active, menus/map/camp/shop all still answer)

PASS — 30 minutes of continuous play, nothing wedged.
```

Caveat worth writing down: this is a `--turbo 10` run, and
`src/tools/README.md` says to validate a turbo run against a non-turbo one.
The plan's own command line for this probe is `--ttl 40 --turbo`, and the
README's own A/B table shows turbo 10 reproducing distance, encounters, forage
and kills exactly, so this is reported as-is rather than re-run for 21
wall-minutes on a contended box.

### Lane 7's empty `Water.riverJoins` — **settled, and it is NOT a bug**

`src/tools/_probe/l23joins.mts`, one boot:

```
[l23joins] joins=0 confluences=0 sources=10 reaches=10 dropped=0 metres=7029
```

`River.ts:596` increments `stats.confluences` on exactly the condition
(`tk >= 0`) that `:778` requires before emitting a join. **`confluences` is
0**, so the routing genuinely found none — ten reaches, none dropped, 7.03 km
of river, all of them running to the same sea, and `:594` deliberately rejects
"two reaches meeting end to end at the sea". `joins` being empty is the
correct output of that routing, not a lost result. The open question in this
file can be closed.
