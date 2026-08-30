# Lane 23 — Swimming and diving

Plan: `docs/plans/2026-08-30-fable-to-nine.md` items **72** (surface swimming)
and **73** (diving). Sized 3–5 lane-lifetimes; this is lifetime **1**.

Owns `src/world/swim/**`, `src/world/collision/CharacterController.ts`,
`src/world/Water.ts` (inherited from lane 7, which finished), and
`src/tools/probes/nanunder.mts`. Cross-lane: two lines in `src/game/Game.ts`
(the registration and the registry keys), landed in the same commit.

## Status

| task | state |
|---|---|
| 72 surface swimming | code landed `f580459`; `swimcross` trajectory instrument landed `9b39b41`; **numbers pending** |
| 73 diving | murk + breath + forced ascent `f580459`; **the from-below shader branch landed `9b39b41`**; `nanunder` baseline taken and **looked at**; re-shoot pending |

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

## Not verified — everything visual

Nothing has been looked at yet. Written but unseen:
- that the swim state actually engages at Alstor;
- **the water surface from below**. Lane 7 confirms every framing it ever took
  was from above, and predicts the from-below fragment is wrong in four ways at
  once (`fres → 1` so 100% of an above-water planar reflection is pasted on the
  ceiling; `refract` TIRs to `vec3(0)`; `down = max(-R.y, 0.10)` makes the path
  10× the depth so `T → 0`; the `fres*0.92` alpha floor makes the underside 92%
  opaque at a grazing angle). **The `gl_FrontFacing` branch is not written.**
- the murk's colour and density;
- the breath gauge's placement.

## Exact next step

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
