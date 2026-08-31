# Lane W3-A — seated and mounted poses

Playtest complaint **#2**: "Anybody the game seats is frozen in a T-pose with
their arms sticking out through the scenery." Driving = bare arms out through
the Regalia's bodywork; riding = "three crucifixes on birds", no legs, sword
through the bird's neck.

## Status: DIAGNOSED, measured. Fixes in progress.

## The headline finding — **the poses are applied; they are just wrong**

`Occupants._applyPose` and `Saddle._applyPose` both run, every frame, and every
bone they name exists on the rig. `probes/seatdiag.mts` reads the live bone
eulers back and they match the pose tables to two decimals. **Nothing overwrites
them and there is no T-pose in the literal sense.** The playtest's "T-pose" is
the *read* of a pose whose arms are abducted and extended far enough to leave
the object the character is sitting in.

So this is not the `Player.update`-stamps-over-it shape the brief suspected.
Verified — `seatdiag.mts`, `--dirty`.

## The measurements (`probes/seatfit.mts`, new, `--dirty`)

    CAR (art frame, +X fwd +Z left, pre-SCALE 1.14; door cards at |z| 0.86,
         seat squab top y 0.925, door top y 0.97)
      hips y 1.054 for all four   <- 13 cm ABOVE the seat squab, 8 cm above the
                                     door top: everyone sits ON the beltline
      worst outboard vs the HULL's own widest point at that station:
        noctis/driver  fingersR 0.071 m proud of the hull
        gladio/rearL   fingersR 0.116 m proud of the hull
      (vs the cabin's own side wall at |z| 0.86 the hands are ~0.41 m outboard)

    BIRD (bird-local; barrel half-width 0.448 at the saddle station)
      thighL clear -0.362   <- 36 cm INSIDE the barrel
      shinL  clear -0.056   footL -0.081   toeL -0.014
      => the whole leg is buried in the bird. That is the filed "no legs, a
         black blob over the fore-flank ending at mid-barrel".
      handL x +0.41 / handR x -0.41  -> the hands are 0.82 m apart at chest
         height, arms near straight: the "scarecrow" read.

## What the frames showed (`probes/seatlook.mts`, new)

- `drive-above`: three bare arms lying out over the bodywork — the front
  passenger's whole left arm out over the door, both rear passengers' outboard
  arms out over the rear quarters, hands flat and splayed. Verified by eye.
- `drive-flank`: the four of them perched with hips at the beltline, entire
  torsos above the door line; the driver's left hand pokes out *through* the
  door skin below the chrome. Verified by eye.
- `drive-front34`: a bare arm extended dead horizontal past the far flank —
  this is the playtest's frame. Verified by eye.
- `ride-flank`: no legs at all below a black hip blob; the rider bolt upright;
  a black rod through the bird's barrel under the saddle. Verified by eye.
- `ride-front34`: both arms straight out forward at chest height holding
  nothing; the reins run from the bit to the saddle with no hand on them.
  Verified by eye.

## Instruments built

- `src/tools/probes/seatdiag.mts` — reads the live seated bone eulers and the
  seat/anchor transforms back out of the page. Answers "is it posed at all".
- `src/tools/probes/seatfit.mts` — **the gate**. Reduces the carrier's own
  vertices (car hull in the art frame; the bird's skinned mesh CPU-skinned to
  its live pose) to a half-width per slab, then reports every rider bone's
  clearance against it. One number per rider.
- `src/tools/probes/seatlook.mts` — drives and rides with real input and
  photographs from the default chase camera plus four free lenses.
  **`applyShot` cannot be used here** — it runs a Director scenario that tears
  the drive down, and the first version of this probe orbited an empty parked
  car and looked like it had worked. `freelook` writes the lens directly and
  calls `g.post.render()` **six times** before the grab, because motion blur
  reprojects against the previous view matrix and one render from a teleported
  lens is a 30 m/s smear on a parked car.

## Left

1. Rework `POSE_DRIVER` / `POSE_FRONT` / `POSE_REAR_*` so no bone leaves the
   cabin, and drop the seated hip height so the party sit *in* the car.
2. Rework `POSE_RIDE`: thighs out round the barrel, hands down and together on
   the reins, forward lean off the hips.
3. The sword through the bird's neck.

## Files owned

`src/world/vehicle/Occupants.ts`, `src/game/chocobo/Saddle.ts`,
`src/tools/probes/seat*.mts`. Nothing else touched yet.
