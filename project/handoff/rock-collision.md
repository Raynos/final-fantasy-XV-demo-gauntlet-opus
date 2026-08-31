# Rock collision — characters stop walking into boulders

*Started 2026-08-31 from `c338443`. The §4 fix wave's other half: lane 12a fixed
the camera, filed the character half as residue, and this is that item.*

The brief, in one line: **`Harvest.collectRockProxies` returned `[]`, so nothing
in this project had ever stopped a character entering a boulder.** Lane 12a
measured the consequence with `probes/fightcam.mts` — Noctis' own chest inside a
rock on **31.5% of combat frames**, and 64% / 58% / 93% / 100% in the four
fights that happened in a tor. The playtest's "my whole screen became a wall of
blurred brown mud" was literal: the fight was inside the rock and so was he.

## Landed

`src/world/collision/RockField.ts` (new). Boulders are answered **per stream
cell**, not harvested at boot. Why it could not be a typing pass:
`CollisionWorld` bakes a static triangle soup off the first few frames, and
`Rocks.stream` (56 m cells) / `Rocks.outcrops` (176 m cells) generate and drop
cells around the camera for the whole session — a one-shot harvest could only
ever collide the boulders near spawn.

- The proxy is `CameraOccluders`' **ellipsoid**, semi-axes `s * j{x,y,z} *
  ext[0..2]` in the instance's rotated frame, read through `Rocks.placedScale`,
  the function `Rocks.update` composes its own matrices through — so the proxy
  is the placed hull, not the recipe. `probes/camproxy.mts` grades that shape
  against the drawn `InstancedMesh` triangles at 99.08% agreement / 0.00%
  mesh-only. Reused, not re-derived.
- A cell's proxies are built on **first touch**, bucketed into 8 m sub-cells,
  and held until the stream drops the cell. Cache validity is the *identity* of
  the live array — `TileStream` hands out a fresh array per generated cell — so
  there is no version counter to keep in step. This is deliberately not
  `CameraOccluders`' one focus-centred window: the lens is one point, and the
  player, three party members, a den of enemies and a chocobo are not.
- `CollisionWorld._resolvePass` queries it. That is the one insertion point that
  reaches every walker at once (Player, Party, Enemies, Npcs, Chocobo all move
  through `CharacterController`), and `blocked()` runs the same pass, so
  companion steering routes *around* a boulder now rather than through it.
- The escape is solved **horizontally** — the ellipsoid gradient picks the
  direction, a ray to the surface gives the distance — for the reason `pushOut`
  gives about wall triangles: a mostly-vertical correction applied to a walker
  who cannot move vertically reads as jitter.
- The step-up rule is the wall soup's verbatim: a rock whose crown is within
  `stepUp` of the feet is a kerb, not an obstacle.
- `Collision.rockPush` is the ablation knob.
- `collectRockProxies` and `boxTriangles`, its only consumer, are deleted.
  `stats.rockProxies` now reports what the cache holds, live.

**Deliberately NOT done in this commit:** rock tops are not offered as ground
support (`groundAt`). `VehicleBody` only ever calls `groundAt`, so the Regalia is
untouched by the push-out — offering rock tops would start it climbing boulders,
which is a second behaviour change wanting its own `roadcheck` number.

`src/tools/probes/rockwalk.mts` (new) — the paired instrument. `fightcam`'s
absolutes are not quotable across runs (lane 12a's landmine: the arm feeds
`Props.update` → streaming → `drawnHeightAt` → where the feet land, so two runs
find two different dens). `rockwalk` sweeps the streamed window for points where
a standing chest would be inside a boulder, clusters them into sites, and walks
the same start pose with the same held key twice — `rockPush` off, then on.

## Numbers

`probes/rockwalk.mts`, four boulder fields found by the probe, ten seconds of
held-forward each, **the same start pose and the same held key both ways**
(`--build 34d5b26`, 2400 paired frames, 7200 ally-frames):

|                          | rockPush OFF | ON        |
|--------------------------|--------------|-----------|
| Noctis' chest in a rock  | **41.92%**   | **0.00%** |
| Noctis' feet in a rock   | 43.63%       | **0.00%** |
| a companion's chest in one | 39.33%     | **0.00%** |

Per site OFF / ON: 56.0/0.0, 46.0/0.0, 53.0/0.0, 12.7/0.0.

**Not a wedge.** Distance walked in the same ten seconds, OFF → ON: 35.5 → 34.6,
35.6 → 32.1, 35.5 → 29.4, 33.9 → 31.5 m. Nobody is pinned against a rock and
nobody stops short; the walk goes round.

Cost: **593 proxies cached over 160 cell builds, 0.10 ms for the slowest build**
across a 560 m sweep plus eight walks. (The first cut read 2620 builds for the
same 137 distinct cells — see `34d5b26`: both streams hashed to one cache key.)

## What the frames showed — looked at, not inferred

`tmp/shots/rockcol/b/`, each pair the same frame index of the same approach,
labelled by the same instrument that produced the percentage.

- **`rw-s1-off.jpg` — a fully black frame.** Nothing but the HUD: the camera and
  the player both inside the same boulder. This is the floor of the defect.
- `rw-s3-off.jpg` — **the playtest's sentence, reproduced**: two thirds of the
  frame a smooth blurred brown mass, no character, no enemy, no horizon, with
  Prompto barking "Whoa — that view!" over it.
- `rw-s3-on.jpg` — the same instant, fixed: Noctis standing **against the face**
  of the boulder, the rock a legible faceted mass down the left, the plain, the
  sky, two dualhorns grazing, Gladiolus in the foreground. Beside it, not in it.
- `rw-s1-on.jpg` — **the honest counter-example.** Noctis is out of the rock
  (`chest in rock false`) but he is pressed flat against a tor with the camera
  crammed behind him, so the frame is still mostly rock face and his hair fills
  the bottom. Vastly better than the black frame it replaces and still not good:
  this is lane 12a's residue item 2, the missing player-mesh fade at a short arm.

## Measured negative — the player-mesh fade

Looked at and **not taken**, on cost rather than appetite. `Player.mesh` is one
`SkinnedMesh` and the accessories hang off `character.root`; a fade means
`transparent` + `opacity` on those materials, which are authored in
`Cast.ts`/`rig/Materials.ts` and shared with the companions, so fading Noctis
fades Gladiolus unless every material is cloned per character first. That is a
material-ownership change in another lane's files, not a knob. The right shape
is a dither/alpha-to-coverage fade in the character shader driven by
`rig.distance`; it wants its own lane. Filed as residue.

## Reported across boundaries — read this if you own one of these

`_resolvePass` was chosen precisely because it reaches every walker at once, and
that means it reaches walkers this lane did not measure:

- **The chocobo.** `ChocoboBody` is a `CharacterController`, so she now collides
  with boulders too. Her selling line in the whistle tutorial is "**she climbs
  what you cannot**", and a bird that is now stopped by a tor she used to walk
  through is a regression against that promise. `probes/chocoborace.mts` and
  `chocobolegal.mts` are the instruments; **not run by this lane**. If it bites,
  the fix is a per-controller opt-out on the push, not a global one.
- **NPCs** (`Npcs`) also route through it. They live in Hammerhead, where there
  are no boulders, so this is noted rather than suspected.
- **The Regalia is not affected**: `VehicleBody` only calls `groundAt`, and rock
  tops are deliberately not offered as ground support. See above.
- **`src/world/props/Rocks.ts` was being edited by the concurrent lane while this
  landed.** That is safe by construction rather than by luck: the proxy is read
  through `placedScale`, the same function `Rocks.update` composes its instance
  matrices through, so any change they make to placement or shape moves the
  collider with the drawn hull automatically.

## Blocked on, while it lasted

The shared trunk was unparseable for a stretch (`src/world/terrain/
TerrainMaterial.ts`, then `src/shaders/sky.glsl.ts`, then
`src/game/interaction/interact.css.ts` — another lane mid-edit), which
red-lights `pre-commit` and `--dirty` for everybody. Waited rather than
committing with the gate skipped or touching a file I do not own. Waiting used
one `CC_ALLOW_POLL=1` background loop, because none of the sanctioned waits
(`daemon --wait`, `gitlock`) covers "another lane's syntax error".

## Next step

1. `fightcam` for the end-to-end number, with its own caveat stated — its
   absolutes are not quotable, `rockwalk`'s pairing is.
2. Rock **tops as ground support** (`groundAt`), so a character can stand on a
   boulder rather than only beside one. Deliberately out of this commit: it is
   the change that would let the Regalia climb boulders, and it wants
   `roadcheck` as well as `gameplay`.
3. Player-mesh fade at a short arm — see above.

## Files

Owned and edited: `src/world/collision/RockField.ts` (new),
`src/world/collision/CollisionWorld.ts`, `src/world/collision/Harvest.ts`,
`src/tools/probes/rockwalk.mts` (new).
Read only: `src/game/CameraOccluders.ts`, `src/world/props/Rocks.ts`,
`src/world/props/TileStream.ts`, `src/world/collision/CharacterController.ts`,
`src/world/vehicle/VehicleBody.ts`.
