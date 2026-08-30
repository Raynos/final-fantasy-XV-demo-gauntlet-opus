# Lane 23 — Swimming + diving (cold-start brief)

Owns: new `src/world/swim/` (`Swim.ts`, `Underwater.ts`),
`CharacterController.ts` (one field + one branch), the from-below branch
in `Water.ts` (**contested with lane 7 — coordinate or hand over**), new
`probes/nanunder.mts`. Everything else is another lane's file — design
for ZERO edits there via the Occupants save/overwrite/restore pattern:
`src/characters/` = lanes 1/2/22, `src/ui/` = 10, `PostFX.ts` = 15,
`Sky.ts` = 4, `src/game/` = 17, `Shots.ts` = 21, `src/tools/` = 16.

## Anchors per task

**Controller.** CharacterController.move() is 4 phases: slope :93-104,
substepped horizontal + world.resolve :106-115, **ground snap/gravity
:117-146 (GRAVITY 19.5 at :7; vy is the single vertical integrator)**,
scramble :159-177. Swim = an early branch in move(): skip §1/§3, drive
pos.y toward water level, vy = 0, grounded = true. Exit-at-bank = §3's
snap test reused against `groundDisc` (CollisionWorld.ts:347; groundAt
:311; blocked :442). Player call site Player.ts:217; speeds :112-113;
sprint :167. Foot IK dies by passing null terrain: Player.ts:236 →
Anim.update:548. **The takeover precedent needing zero src/characters/
edits: Occupants.enter (vehicle/Occupants.ts:261-271)** saves and
overwrites p.terrain = NO_GROUND, party.terrain, speedMul, and runs in
lateUpdate — "the last word over Player and Party" (:308-311).

**Water level queries.** `Water.surfaceAt(x,z)` (Water.ts:931) — ≤5 body
AABBs, returns level, null off-body, **rivers not included**.
**`WaterMask.levelAt(x,z)` (water/WaterMask.ts:158) is the real one** —
bodies + hashed barycentric lookup into the drawn river sheet (CELL 8),
−Infinity where dry. Depth for the >1.2 m gate = `level −
CollisionWorld.groundAt(...).y` (NOT terrain.heightAt, or you swim
through jetties). Bank-finding: copy Fishing._survey
(Fishing.ts:233-300) — wet() + 36 rays + 1 m step-back. Body AABBs are
rectangles over basins: `surfaceAt` says wet over dry land inside the
rectangle — ALWAYS pair with a ground test.

**Camera.** CameraRig._armDistance (:250-289) sweeps terrain only; the
ground floor clamps against the LAKE BED (:535-537), so the lens sinks
under the plane freely today. Framed shots clamp at heightAt+1.35
(:350-352) — an authored underwater framing between bed and level
survives. Water._shouldReflect bails when cam.y < level (:849).

**Water from below TODAY.** Lake surface: DoubleSide, transparent,
depthWrite:false, renderOrder 5 (Water.ts:559-561, :478-488) — backface
draws, unshaded for it. River + shore: FrontSide (RiverMaterial.ts:87-89,
ShoreMaterial.ts:75-79) — vanish from beneath (correct). Predicted
from-below failure in the lake fragment (:640-770): V points down, N +Y →
dot < 0 → fres = 1.0 → 100% planar reflection sampled from an
ABOVE-water reflect cam (sky pasted on the ceiling); refract from the
wrong side TIRs to vec3(0); `down` clamps to 0.10 → path ≈ 10× depth →
T → 0. Fix = branch on `gl_FrontFacing`: Snell cone (~48.6°) showing the
compressed sky disc, mirror the underwater scene colour outside it,
alpha from viewing angle.

**Murk — cheapest path (no PostFX pass; lane 15 owns the chain).**
Repoint the shared atmosphere uniforms exactly as
`Dungeons._applyInteriorAtmosphere` does (Dungeons.ts:751-792): uSkyDim
0, uNight 1, uNightTint = water tint, uFogBase = waterLevel, uFogHeight
small, uFogDensity high, uHazeBase, plus post.autoGrade = false /
setGradeBlend. Depth-correct murk on every patched material for free.
**Sky.update rewrites these each frame (Sky.ts:1290-1292) — write in
lateUpdate.** Precedent for toggling post from outside:
Wetness.ts:53 flips post.ssr.enabled.

**Breath HUD.** Own class appending to `game.uiRoot` with inline style
(el() accepts cssText, UIKit.ts:26) — zero src/ui/ edits. Bar
(ui/Bar.ts) is the gauge pattern; Armiger gauge (CombatHUD.ts:230-240)
the vertical worked example.

**Party waits at shore.** Levers settable from outside: m.speedMul
(Occupants zeroes it) and the recall teleport (Party.ts:395-430, dist >
100, 55° cone). Pin m.slot/baseSlot to the last dry sample on the entry
ray, zero speedMul, **raise the recall distance while swimming** or
companions teleport into the lake when the camera looks away.

**No combat in water.** `combat.scenarioLock = true` short-circuits
CombatSystem.update (:1303-1313; Director sets it at :391/:460/:539/
:674). Blade: `combat.weapon.setReveal(0)` (:551; restored by
materialise :560). Companions: PartyAI.ts:251 carry.stow. Do NOT use
input.enabled = false (zeroes move).

**Drowning.** Dungeons._hazards (:711-724) is the pattern: `s.hp =
max(1, hp − dps·dt)`; cold water 12 dps precedent Fociaugh.ts:105.

## Architecture (decided)
`src/world/swim/Swim.ts` + `Underwater.ts`, registered by one Game.ts
line (explicit pathspec, after Camera), writes in lateUpdate. Swim reads
WaterMask.levelAt + groundAt; on entry saves/overwrites player.terrain
(kills foot IK), speeds → 2.2/3.4, scenarioLock, setReveal(0), party
speedMul 0; on exit restores everything in one place. The only
CharacterController edit: a `swim`/`buoyLevel` field + the early branch —
buoyancy lives where vy lives so gravity can never race it. Diving = same
state with pos.y free below level, breath integrating down, forced
ascent ~1.5 m/s with input ignored.

## Commands
```
node src/tools/probe.mts src/tools/probes/nanunder.mts --dirty     # the new instrument
node src/tools/shoot.mts <shots> --jpeg
node src/tools/framecam.mts …        # SHOTS.__probe pattern (framecam.mts:100-105) — photograph underwater without Shots.ts
node src/tools/gameplay.mts
node src/tools/probe.mts src/tools/probes/longplay.mts --dirty     # check daemon --health first (exclusive lease)
pnpm run check && pnpm run typecheck
```
**Two underwater probe framings (bed/level verified: Alstor basin
(−1355,745) h−18; Vesperpool (−2940,−2280) h−22; both level −6.5):**
`under_alstor` pos [−1355,−9.5,745] target [−1290,−6.2,790] fov 55
(grazing look up at the underside + Snell window); `under_vesper` pos
[−2940,−12.0,−2280] target [−2938,−6.4,−2246] fov 60 (near-vertical from
5.5 m down). Both sit above the bed so the shot clamp leaves them alone.

## First commits
1. `probes/nanunder.mts` (new file only) — nanscan's h2f + rtScene
   readback (nanscan.mts:20-45) over the two framings. Rule 3, and it
   proves the from-below pass.
2. Swim.ts + the Game.ts one-liner — depth probe, enter/exit hysteresis,
   saved-state block, no rendering. Prove floor-walking gone at Alstor in
   gameplay.
3. CharacterController swim branch (buoyancy + vy ownership + bank exit).
4. Water.ts gl_FrontFacing branch (coordinate with lane 7 FIRST).
5. Underwater.ts — murk + breath gauge + forced ascent.

## Landmines
- **NaN classes from below**: sampleNormal = normalize(tex*2−1)
  (Water.ts:580-582) NaN on a (0.5,0.5,0.5) texel; normalize at :646-649
  and :740 NaN on zero vectors — V flips sign underwater, a NEW way to
  hit them. refract() returns vec3(0) under TIR; anything normalizing it
  is a hole. NaN survives the composer as pure black; only nanunder sees
  it.
- **March overshoot**: `down = max(−R.y, 0.10)` (:670-672) is 10× from
  below; SSR (maxDistance 60), GTAO and DoF march a depth buffer with no
  water surface in it (depthWrite:false). Cap path lengths explicitly.
- **Do not add a fifth copy of "is this wet"** — WaterMask.ts:1-42 is the
  file-length essay on that bug class. surfaceAt/_shouldReflect test the
  GLOBAL level and rectangle AABBs.
- Ownership: Water.ts double-assigned (7 + 23); Shots.ts is 21's;
  Player/Party/PartyAI are 22's. Zero-edit design or the lanes deadlock
  on gitlock.
- Party recall teleports at 100 m with the chase cap open — handle
  before the first long swim.

## Done-when
Swim across Alstor with no floor-walking, entering at >1.2 m, exiting at
a bank under control, in gameplay; longplay clean. Dive under Alstor AND
the Vesperpool: breath drains and forces a surfacing ascent; the surface
reads as a surface from below (Snell window, not sky-on-the-ceiling);
nanunder 0 NaN on both framings; check + both typechecks green; every
cross-lane touch a named one-liner or a TASKS.md row.
