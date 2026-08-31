# Lane 12a — the combat camera

*Started 2026-08-31 from `3b4ef72`. §4 fix wave of `docs/plans/2026-08-30-fable-to-nine.md`.*

The brief: the playtest's number-one complaint, **"fights happen inside a hill,
and I can't see any of them"**, independently filed by lane 11 from its own
`f-engage` frame ("the frame where a fight starts is 90% the inside of a
boulder").

## The finding, which is not what either observer thought

**The terrain is innocent. The hill is a rock, and the deeper defect is that
Noctis walks into it.**

- The player's own diagnosis — "on a slope the camera sits 0.7 m above the
  ground beneath it" — names a real number. It is `probeRadius + 0.42` = 0.74 m,
  written twice in `CameraRig` (the arm's hit test and the ground floor). It is
  now one named field, `groundClearance`. **It is not the cause.**
- `probes/camview.mts` (new) sweeps 3552 combat poses with the rig's own solver
  and grades the heightfield: **0.00% put Noctis behind the ground** and no pose
  put half the frame in mud within 3 m. **Verified.**
- `CameraRig._armDistance` swept terrain and *nothing else*. Where a prop sweep
  should have been was a dead comment: a raycast against
  `Props.cameraColliders || .colliders || .collisionMeshes`, none of which
  `Props` has ever had, so the list was always empty and the ray never ran.
- `CollisionWorld` cannot help. `Harvest.collectRockProxies` returns `[]` and
  `stats.rockProxies` reads **0** in a live page. **Verified**, not inferred.
- **`probes/fightcam.mts` (new) measures Noctis' own chest inside a boulder on
  31.5% of combat frames** across four real den fights, and 64.4% / 57.7% /
  92.8% / 100% in the individual fights that happened in a tor. Characters have
  no boulder collision either. *The fight is inside the rock.* No camera can fix
  that half. **Verified. This is the biggest thing this lane found and it is
  residue, not fixed.**

## Landed

`CameraOccluders` (`src/game/CameraOccluders.ts`, new) keeps the boulders within
an arm's length as **ellipsoid proxies** — semi-axes `s * j{x,y,z} * ext[0..2]`
in the instance's rotated frame, read through `Rocks.placedScale`, the function
`Rocks.update` composes its matrices through, so the proxy is the placed hull
and not the recipe. Rebuilt when the focus moves 2 m or 0.5 s passes, from the
two-to-four 56 m stream cells an arm touches. `CameraRig._armDistance` sweeps
ray-against-ellipsoid; `rig.occluderPush` is the ablation knob.

Two corrections came out of measuring, and both are in the git log:

1. **`minDistance` was the wrong floor** for a solid. 1.1 m is a comfort minimum
   against a hillside; against a boulder 0.6 m behind the shoulder it puts the
   lens *through* the rock face. `SOLID_MIN` is 0.4.
2. **The radial push-out was deleted.** `probes/camlook.mts` photographed it
   turning a legible frame into a full-screen wall of brown rock at (180, 360):
   it lifted the lens 2 m out of one proxy and flat against the next. An
   ellipsoid is not the fractured hull it stands for, and a radial direction is
   not one the shot cares about. The recovery is now a jump to `_desired`, which
   is on the arm line and clear by construction; when `_desired` is not clear
   either, the lens is left where the plain arm put it.
3. `CameraOccluders.arm` handles the focus-inside-a-rock case by running the arm
   **out through the far face** rather than shortening it — shortening measured
   *worse* than no fix at all (55.4% against 30.6% on one round).
4. The **shoulder offset now scales with the arm**. It is 0.55 m because 0.55 m
   at 5.6 m is a third off centre; it is an angle, and at a 0.66 m arm it was 8x
   its authored value, with Noctis' head across a quarter of the after-frame.

## Numbers

`probes/camview.mts`, 3552 paired poses, same world, same poses, both solvers
(`--build 91e2a4f`):

|                                       | push-out ON | OFF   |
|---------------------------------------|-------------|-------|
| lens inside a boulder                 | **0.62%**   | 1.24% |
| blind (Noctis behind ground or rock)  | **0.56%**   | 1.21% |
| frame >50% solid within 3 m           | **0.56%**   | 1.15% |
| frame >90% solid within 3 m           | **0.56%**   | 1.15% |
| mean mud3                             | **0.0112**  | 0.0174|
| mean clearance                        | 2.88 m      | 2.89 m|

Every remaining failure is flagged `STILL IN ROCK` — Noctis inside an outcrop.

A confirmation run of `probes/fightcam.mts` at `91e2a4f` (6 rounds, 4 fights,
4376 combat frames) came back **0.00% on every column, including the
counterfactual and including `heroInRock`**: all four dens it found were fought
in the open, clearance mean 3.39 m / min 1.54 m, no blind frames. That is a
null result, not a confirmation of the fix, and it is the run-to-run swing
described in "Left / next step" item 4 — it does say the open-field camera is
unregressed, and nothing more. **`camview`'s paired sweep is the number.**

`probes/camproxy.mts`, the proxy graded against the **drawn `InstancedMesh`
triangles** (walked directly; a probe body has no `Raycaster`), 546 rays from
eight standing positions: **99.08% agreement, 0.00% mesh-only** (never misses a
rock the renderer draws — the safety property), 0.92% proxy-only, mean distance
error **−0.87 m**, i.e. the proxy stops the arm early. **Verified.**

Gates, taken behind `daemon.mts --wait exclusive-free` (`exclusive-free after
0.0 s`; the lease then waited on the quiet lane, so the box was not busy):

- `gameplay --build HEAD`: **PASS, every segment ≥ 60 fps**, worst
  `streaming-traverse` 125.0 fps, 1 hitch (39.1 ms at frame 0), `RULER_VALID`.
- `combatloop --build HEAD`: **35/35**.
- `perf` not run: nothing in the posed path changed. The `shot` branch of
  `lateUpdate` and `Shots.ts` are untouched; every edit is in the live gameplay
  branch, which `gameplay` covers.

## What the frames showed — looked at, not inferred

- `tmp/shots/lane12a/auto-s2-off.jpg` — **the playtest's frame**: a full-screen
  wall of blurred brown rock with two `VORETOOTH` nameplates and a floating
  `53`. No character, no enemy, no horizon.
- `tmp/shots/lane12a/final-s1-on.jpg` — same instant, arm 5.38 m → 0.48 m: five
  voretooths, the party engaged, the plain, the mesa on the skyline, the rock
  face a dark sliver on the left edge where an occluder belongs. Noctis' shoulder
  is a foreground element bottom-right rather than a head filling the frame.
- `tmp/shots/lane12a/look-s2-on.jpg` — the frame that killed the radial push:
  brown mud, party gone. Kept deliberately as the counter-example.
- `tmp/shots/lane12a/look2-s*.jpg` — after deleting the push, ON and OFF at
  (180, 360) differ by 0.1 m and both still show the party. Not made worse.

## Left / next step

1. **`Harvest.collectRockProxies` returns `[]`, so characters walk through
   boulders and fights are fought inside them** (31.5% of combat frames, up to
   100% in a tor). This is the root cause of the complaint and the whole of the
   residual 0.62%. It is a real gameplay change wanting its own commit, its own
   perf number, and a streaming answer — the harvest is one-shot at boot while
   rocks stream, so the function as designed could only ever collide the boulders
   near spawn. `CameraOccluders` is a working precedent for the streaming half.
2. The close-arm frame is playable but tight. A player-mesh fade below ~1.2 m of
   arm is what every third-person game does; it lives in `Player`/`Cast`, not
   here.
3. The player's second complaint — "the fight is 40 m up a hill happening to my
   allies while I stand still" — is **not touched** and is not a camera fix. It
   is aggro range and party engagement, `src/combat/` and `WildTerritories`.
4. `probes/fightcam.mts` numbers swing hard between runs because the route
   diverges: the arm feeds `Props.update(camPos)`, therefore streaming,
   therefore `Terrain.drawnHeightAt`, therefore where the feet land. **Quote
   `camview`'s paired sweep, not `fightcam`'s absolutes.**

## Files

Owned and edited: `src/game/CameraRig.ts`, `src/game/CameraOccluders.ts` (new),
`src/tools/probes/{camview,fightcam,camproxy,camlook}.mts` (all new).
Read only, not edited: `src/world/props/Rocks.ts`, `src/world/props/TileStream.ts`,
`src/world/collision/{CollisionWorld,Harvest}.ts`.

Commits: `42f5769`, `0408bb0`, `a1d8ffd`, `dd46178`, `b0870b6`, `83cbf27`,
`91e2a4f`.
