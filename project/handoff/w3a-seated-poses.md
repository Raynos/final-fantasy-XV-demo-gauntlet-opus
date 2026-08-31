# Lane W3-A — seated and mounted poses

Playtest complaint **#2**: "Anybody the game seats is frozen in a T-pose with
their arms sticking out through the scenery." Driving = bare arms out through
the Regalia's bodywork; riding = "three crucifixes on birds", no legs, sword
through the bird's neck.

## Status: all four halves landed and verified by eye. Gates green.

| sha | what |
|---|---|
| `4715027` | The three instruments, and every seated/mounted pose re-solved |
| `dae18d3` | Companions' stowed weapons put away for the drive and the ride |
| `1229655` | The stirrup iron raised to a height a leg can reach |
| `cdcc727` | Noctis' sword — the literal "through the bird's neck" — put away |

## The headline finding — **the poses were applied; they were just wrong**

`Occupants._applyPose` and `Saddle._applyPose` both run, every frame, and every
bone they name exists on the rig. `probes/seatdiag.mts` reads the live bone
eulers back and they match the pose tables to two decimals. **Nothing overwrites
them and there is no T-pose in the literal sense.** The playtest's "T-pose" is
the *read* of a pose whose limbs leave the object the character is sitting in.

So this was NOT the `Player.update`-stamps-over-it shape the brief suspected.
Verified — `seatdiag.mts`.

## The numbers (`probes/seatfit.mts`, new)

    CAR  (art frame x SCALE 1.14: door cards |lat| 0.952, door top up 1.106,
          seat squab top 1.055, wheel centre fore -0.023 up 1.334 lat 0.502 r 0.194)

                                 before                  after
      worst bone outboard        0.338 m past the        0.000 m   PASS
                                 door card (gladio's
                                 right fingertip)
      driver's hands apart       0.63 m                  0.33 m
      driver's hands off the     0.311 / 0.524 m         -0.007 / -0.003 m
        wheel rim                                        (i.e. ON it)

    BIRD (bird-local; barrel half-width per (z,y) cell from the live skinned mesh)

                                 before                  after
      thighL clearance           -0.362 (36 cm INSIDE)   -0.221
      shinL  (the knee)          -0.056                  +0.032  outboard
      footL  (the ankle)         -0.089                  -0.028
      toeL                       -0.022                  +0.030  outboard
      hands apart / above hips   0.86 m / 0.43 m         0.29 m / 0.10 m

The ankle's -0.028 is not a defect: the outline is a max over a 0.15 x 0.12 cell
and the bird's own thigh feathers sit at exactly boot height, so a boot
photographed in clear air still measures a few centimetres "inside" the widest
thing in its cell. The knee and the toe are the honest tests and both clear.

## What the frames showed — every one verified by eye

Before (`tmp/shots/seatlook/`):
- `drive-above`: three bare arms lying out over the bodywork, hands flat and
  splayed. `drive-front34`: a bare arm dead horizontal past the far flank —
  the playtest's own frame. `drive-flank`: the driver's hand out *through* the
  door skin, and nobody's hands anywhere near the wheel.
- `ride-front34`: both arms straight out forward at chest height holding
  nothing. `ride-flank`: no leg at all below a black hip blob.
- `ride-chase` — **the default camera** — a full sword lying horizontally out of
  the rider's right side, hilt at his back, for the whole ride.

After (`tmp/shots/w3a/`, `tmp/shots/w3b/`, `tmp/shots/w3c/`):
- `drive-above`: nothing crosses the bodywork. All four sets of arms inside the
  car; the back-seat sprawl reads as one arm over the seat and one on a knee.
- `drive-flank`: both of the driver's hands closed on the wheel rim.
- `ride-rider-flank`: thigh over the shoulder of the barrel, shin down the
  flank, boot at the stirrup, both fists together on the rein — and the rein now
  runs bit → withers → fists instead of ending on the pommel.
- `ride-leg`: the boot sits at the iron rather than a hand's width above it.

## The four fixes

1. **Every seated and mounted pose re-solved against the geometry it sits in.**
   `_probe/w3afk.mts` is a CPU FK of the real rig — bind rotations are identity,
   so a pose table is a chain of YXZ eulers over known bind offsets, and the
   answer costs microseconds instead of a 90 s page round trip. It takes
   targets (the wheel rim, the door cap, the rein, the stirrup iron) and
   hill-climbs the angles under joint limits, symmetric intent solved once and
   mirrored. **The joint limits are load-bearing**: the first unconstrained
   solve hit every target to the millimetre with 166 degrees of forearm yaw.
2. **Companions' stowed weapons hidden while aboard.** Gladio's greatsword
   measured `y 1.81` down to `y -0.03` — from his shoulder, through the whole
   bird, into the ground. No stow angle fixes 2.05 m of steel on a seated man.
3. **The stirrup iron raised from y 1.10 to 1.19.** A 1.8 m rig seated at 1.86
   has 0.837 m of leg and the hip-to-iron distance was 0.836 m: a boot in that
   iron was a leg at 100% extension, which is why the old pose gave up and left
   the leg inside the barrel.
4. **Noctis' own blade hidden while aboard** — see the open question below.

## Open questions / residue for `project/TASKS.md`

- **`CombatSystem.hand` is an offset, not a socket.** It parents all five weapon
  classes to a plain `Group` pinned at `(-0.30, 1.12, 0.12)` on `player.root`,
  so it ignores every pose in the game. Mounted, that is bird-local
  `(-0.30, 2.0, 0.12)` — the base of the neck — and sheathed weapons at reveal 0
  still draw as a pale blue ghost. **This is the literal source of "Noctis's
  sword floating horizontally through the bird's neck."** I hide the group while
  seated or mounted; the real fix is `attach.handR` and belongs to whoever owns
  `CombatSystem`. It will also be wrong in any other non-locomotion pose —
  swimming, fishing, sitting at a haven.
- **The Regalia's cabin is 0.53 m too shallow for the people in it.** Measured:
  the door top is 1.106 m off the road and the seat squab top — the H-point — is
  1.055 m, so the beltline is 5 cm above the hips where a real convertible is
  about 60 cm. Everybody's shoulders are 0.26–0.31 m *above* the door line and
  their whole torsos read as sitting on the car rather than in it. Not fixable
  from the pose side and `src/world/props/Regalia.ts` is not this lane's file.
  The arms no longer cross the bodywork, which is the reported defect, but the
  seating height is the reason they were so visible.
- **The rider's two hand meshes still differ** (closed dark glove against a
  paler open hand). Both finger chains are now curled by the same amount in the
  pose table, so what remains is `Outfit`/`Look`, not the pose. Already filed.

## Files owned and touched

`src/world/vehicle/Occupants.ts`, `src/game/chocobo/Saddle.ts`,
`src/game/chocobo/ChocoboSystem.ts` (one line in `init`, to hand `Saddle` the
combat hand group), `src/characters/chocobo/ChocoboRig.ts` (reins and stirrups),
`src/tools/probes/seat{diag,fit,look}.mts`, `src/tools/_probe/w3afk.mts`.
Nothing else.

## Instruments, and the traps written into them

- `seatdiag.mts` — reads the live seated bone eulers and seat transforms back
  out of the page. Answers "is it posed at all".
- `seatfit.mts` — **the gate**. Reduces the carrier's own vertices to a
  half-width per slab and reports every rider bone's clearance. `visible` is
  per-node and `traverse` does not respect ancestors, so it walks the parent
  chain — without that it reports every weapon `_hideProps` put away as still
  drawn, which cost me a wrong-turn hunt for a second bug.
- `seatlook.mts` — drives and rides with real input and photographs the default
  chase camera plus five free lenses. **`applyShot` cannot be used here**: it
  runs a Director scenario that tears the drive down, and the first version of
  this probe orbited an empty parked car and looked like it had worked. Its
  `freelook` writes the lens directly and calls `g.post.render()` **six times**
  before the grab, because motion blur reprojects against the previous view
  matrix and one render from a teleported lens is a 30 m/s smear on a parked car.
- `_probe/w3afk.mts` — the CPU FK and the pose solver. `SOLVE=1 node ...` prints
  copy-pasteable pose-table fragments; plain `node ...` prints the current
  tables' clearances without touching the browser at all.
