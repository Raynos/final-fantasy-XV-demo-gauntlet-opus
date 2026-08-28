# combat — WS-11's combat list

Owns `src/combat/`, `src/characters/ai/PartyAI.ts`, `src/game/CameraRig.ts`
(the framing block) and the fight-side of `src/ui/` (call-outs, damage
numbers, the victory card). Brief: `docs/plans/2026-08-26-opus-the-standing-backlog.md`
§WS-11, the Combat half.

## Landed, and looked at

| sha | what |
|---|---|
| `e218f5b` | the combat camera's whip — **the arm sweep was innocent** |
| `10c2688` | warp-strike shards read as crystal, not confetti |
| `6a00b0f` | a victory card, a readable call-out, four damage-number lanes |
| `ea87e16` | "Noctis does 14%" was the probe standing 1.5 m outside its own reach |
| `77e5c51` | the attack step-in, and a warp-strike that scales with distance |

### 1. The whipping arm — **closed, and the stated cause is a measured negative**

`probes/armwhip.mts` (new) drives the same den fight `fightshape` drives and
records the lens's own kinematics per frame, decomposed into focus
translation / arm length / orbit, with `yawTarget` writes attributed to the
framing block or to the probe's own re-aim.

**`CameraRig._armDistance` is not the cause.** Zero frames at the
`minDistance` clamp, in the fight and in the walking control, and 14.45 of
the 14.86 m/s p95 lens speed is the ORBIT term. The whip is the combat
**framing block**, which steered `yawTarget` at the bearing from the PLAYER
— the one unstable quantity in a melee — with no deadzone and no rate limit,
while `restDistance = targetDistance + flat * 0.22` ran the arm out to 7.9 m
so every degree of it was 40% more lens travel.

Same probe, same policy, `47d6a37` vs `e218f5b`:

| | before | after |
|---|---|---|
| lens speed p95 / p99 | 9.85 / 17.07 m/s | **7.00 / 12.25** |
| orbit term p95 | 9.76 m/s | **5.49** |
| lens turn p95 | 85 deg/s | **49** |
| arm p50 / p95 | 6.25 / 7.87 m | **5.20 / 5.60** |
| undamped arm collapses | 14 (1.3%) | **0** |
| frames over 8 m/s or 200 deg/s | 113 | **39** |

Verified by eye: `tmp/shots/cb0/f-stagger.jpg` (before, an unreadable
full-frame smear) against `tmp/shots/cb2/f-stagger.jpg` (after, near-sharp,
the sabertusk framed centre with its nameplate).

`probes/smearsrc.mts` (new) photographs one simulation state five times with
a post stage switched off each time. It found the full frame already sharp at
trauma 0.000 — so what was left in the probe's frames after the rig was fixed
was the **probe**: `fightshape` wrote `yawTarget` outright, which no hand or
stick can do in one 16 ms frame, and the rig burned that error down at
`rotDamp` as a 900 deg/s sweep. Both fight probes slew at 5 rad/s now and
measure `bearingOff` from the **lens**, which is what the name always claimed.

### 2. Combat framing — **landed**, same commit; it was the same defect

Yaw steers on the lens-relative bearing with a 0.26 rad deadzone and a
1.5 rad/s ceiling; pitch is 0.30 rad (17°) against the 0.16 (9°) it replaces,
rate-limited to 0.9 rad/s; the arm is a function of the target's **height**
(`setLockOn` takes it, `_frameCombat` passes `t.height * t.scale`) rather
than its distance, and the lock point is damped and lifted by `0.55 * height`
because an enemy's `root` is at its feet.

### 3. The end of a fight — **landed**

- `ScreenFX.victory()` — species, the word, a hairline, and four cells for
  kills/EXP/gil/spoils, on a low-opacity plate with angular corner cuts. On
  `ScreenFX` and not `CombatHUD` because the combat layer's reveal is already
  collapsing when a victory resolves. `HudBridge` wires `encounter:victory`
  and clears the call-out at the same moment.
- The `STAGGER!` call-out now stands on a soft wash — an ellipse of plate
  colour with no border and nothing to read as a panel — so 200-weight white
  type survives a bright sky.
- Damage numbers: four lanes on a **vertical** ladder, held at full strength
  from frame one. The old offset was `dx * easeOutQuint(t)`, exactly zero on
  the frame a number is born, which is why `tmp/shots/cb0/f-victory.jpg`
  reads "1,8039". Measured by `probes/endbeat.mts` (new) on four simultaneous
  hits at one world point: **2 overlapping pairs -> 0, closest gap 30 px**.

Verified by eye in `tmp/shots/eb3/`.

### 4. Warp-strike shards — **landed**

`CrystalShards` was alone in `src/combat/` in being `NormalBlending` +
`DoubleSide` + `depthWrite: false`; every other VFX material there is
additive. Normal blending over a bright sky *darkens*, and double-siding a
closed solid with the depth write off draws the far facets over the near ones
and flattens the shards into paper. Additive + `FrontSide` now, with a real
emissive gradient along `vFacet` (deep blue glass body, near-white cyan tip,
lit facet edges), and the impact burst is two smaller shells instead of one
58 x 0.21 m shower.

Verified with a **cold** capture (`warp_strike`, `warp_wide`,
`combat_stagger` — before/after in `tmp/shots/shard-{b,a}/`) because a GLSL
link failure is invisible on a warm page, and by eye at close range in
daylight in `tmp/shots/cb2/f-victory.jpg`.

**Three corpus baselines move**: `warp_strike`, `warp_wide`, `combat_stagger`.

### 5. "Noctis does 14% of the damage in his own fight" — **the stated knob is a measured negative**

`probes/dpsshare.mts` (new) asks the damage formula rather than a fight. At
**full uptime** Noctis already has **64%** of the party's output (781 dps to
gladio 203, ignis 131, prompto 112). `PartyAI.ROLES`' motion values are not
the knob; the whole gap is uptime, which `ROLES` cannot reach.

Two real causes, both now fixed:

- **The probe** walked to `t.radius + 3.4` — 4.4 m for a sabertusk — with a
  2.05 m blade, and swung at air. Round 3 went **0% -> 27%** on that line
  alone.
- **The game**: 0.27-0.33 blows landed per second against a combo cadence of
  2.27, with a mean range to the *nearest* animal of 4.2-5.7 m. There was no
  attack step-in. There is now (`CombatSystem._stepIn`, 9 m/s while a swing
  winds or is active, stopping at the target's footprint plus 78% of reach).
- **Warp-strike** was 30-68% of all damage in every fight and measured
  1351-3380 against a sabertusk's 780 max HP. `warpMotion(dist)` ramps
  0.55 -> 2.0 over 3 -> 20 m, which is what the HUD call-out has always
  claimed ("Damage scales with distance covered") and the code never did.
  Point-blank staggered punish 1921 -> 556; the 24 m opener is unchanged.

## Open / reported, not fixed

- **The boulder in the near corner is prop occlusion, not the arm.**
  `_armDistance` sweeps **terrain only** — there has never been a prop sweep,
  and its own comment says `Props` would have to publish an opt-in
  `cameraColliders`. `tmp/shots/cb1/f-engage.jpg` is a rock filling the
  top-right quadrant a metre from the lens. Fixing it needs `Rocks` (a
  `TileStream` of instances, `src/world/props/Rocks.ts`) to publish the
  nearby instances' centres and radii; `CameraRig._armDistance` is where the
  sweep would go and is written to take one.
- **A wild enemy's max HP is one Noctis combo.** Sabertusk lv 21 = 1381 hp;
  a full Engine Blade combo is 1375 over 1.76 s and the party's full-uptime
  output is 1227 dps. That is why field encounters last **6-7 s** against
  FFXV's 30-90. Not this lane's: it is enemy HP scaling
  (`WildTerritories` bands / `RpgSystem.enemyScaling`), WS-10's directory.
- **The party's damage is still mostly the retinue's** in short fights,
  because they are always in range and Noctis is not. The step-in narrows
  it; whether it closes it is the run in `tmp/fightshape-after.txt`.

## The instruments

New, all under `src/tools/probes/`:

- `armwhip.mts` — lens kinematics in a real fight, decomposed, with yaw
  attribution. This is the one that killed the `_armDistance` diagnosis.
- `smearsrc.mts` — five photographs of one simulation state with one post
  stage off each time.
- `dpsshare.mts` — the damage formula's own answer to "whose fight is it",
  at full uptime, plus what a warp-strike is worth at 3 / 12 / 24 m.
- `endbeat.mts` — the two UI beats no authored shot reaches: the call-out
  over a bright sky, the victory card, and four numbers at one world point.

Corrected: `fightshape.mts` — lens-relative `bearingOff`, a rate-limited
aim, a standoff read off the drawn weapon's reach, and **blows landed per
attacker per second** next to the damage share.

## Files touched

`src/game/CameraRig.ts` · `src/combat/CombatSystem.ts` ·
`src/combat/CrystalShards.ts` · `src/combat/VFX.ts` · `src/ui/ScreenFX.ts` ·
`src/ui/HUD.ts` · `src/ui/HudBridge.ts` · `src/ui/CombatHUD.ts` ·
`src/ui/ui.css` · `src/globals.d.ts` · five probes.
