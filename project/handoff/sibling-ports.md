# Sibling-repo ports — handoff

Owner: opus, 2026-08-23. Plan: `docs/plans/2026-08-21-fable-sibling-ports.md`
(re-audited and re-ticked in `7419942`; its table is the authority, this file is
the working state).

## Done and verified this pass

Ten commits, `05fa8fb`..`347b392`. Gates **12/12** re-run end to end after the
renderer changes and again after the camera change.

| commit | what |
|---|---|
| `05fa8fb` | grade: the print fade was a highlight cap, not a shadow flash |
| `dafa76b` | imagestats: a verdict line that does not contradict itself |
| `6041077` | grade: film bleach — hot pixels go white, not amber |
| `e17e265` | grade: toe expands the shadows instead of lifting them; mid-weighted grain |
| `70506db` | atmosphere: actors take no near-field haze, terrain does |
| `9db4548` | imgdiff: a measured noise floor per shot |
| `4d94169` | sky: ablate the two diffuse ambients separately — one is inert |
| `fd1a153` | camera: lens no longer ends up inside hills (4.77% -> 0.00%) |
| `347b392` | camera: `lookScale()` — look that does not retune under the sprint FOV |
| `77555a7` | enemies: grass hides you from sight, and only if you hold still |
| `7419942`, `236e8f7` | the plan re-audit, and the 3.7 correction |

Measured net on the grade, six graded shots against the FFXV field corpus:
median range **9.46 -> 11.06 stops** (ref 9.79), black point 3.5 -> 1.1 (3.4),
`p99.9` 253.4 -> 254.8 (252.0). Daylight-only slice passes **8 of 9** checks.

## New instruments — use these before re-deriving anything

- `?post=nobleach` — the scene-linear film bleach. It is *scene-referred*, so
  `nolut` does not ablate it; that is the trap that sent the first diagnosis to
  the wrong file.
- `?post=noactorhaze` — collapse the actor haze law onto the terrain law.
- `?post=noambient` / `?post=noenv` — the two diffuse ambients, separately.
  **Pair them with `?post=noexp`**: closed-loop exposure compensates and the
  unpinned numbers read backwards.
- `src/tools/probes/camsweep.mts` — camera lens-inside-terrain rate over 13,872
  poses. Run it before and after anything touching `_armDistance`.
- `src/tools/probes/conceal.mts` — vegetation concealment: whether it is
  *wired* and whether it *changes an answer*, asked separately. **It ticks
  `Enemies.update` once first** — reading `_ctx` straight out of a settled
  capture reports a live system as dead, which it did on its first run.
- `imgdiff --calibrate` + `project/noise-floors.json` — per-shot floors.
  Regenerate with two `--cold` captures of one build.

## Next step, exactly

**3.7 is already built** — do not start it. It was audited as missing twice,
including once by me, before anyone read the file: `Water.ts:15-43` has
per-channel Beer-Lambert, a real Snell step (`refract(-V, N, 0.7502)`), the
heightfield bed and flow-derived foam. Wave 2 is therefore complete apart from
3.6, which belongs to procedural-modeling.

So, in value order:

1. **3.8(a)**, which is measured and specified in the plan: the env cube is the
   entire diffuse ambient at 5% of scene luma and 3.9 of the 12.5-point
   shadow-colour gap, and nothing shadows it. Build the L2 SH probe and demote
   the env cube to specular-only — **and resolve the inert `HemisphereLight` in
   the same change**, because it is the diffuse fill that is already there and
   already doing nothing (0.4 luma of 87.7, measured at two hours).
2. **Wave 4's perception meter + alert ladder** and **cover/fire rhythm** —
   both belong to `2026-08-22-opus-phase4-content-and-gameplay`.
3. **3.8(b) PCSS** — not evaluated at all.

## Open questions

- The grade's remaining daylight miss is shadow warmth: −8.8 R−B against a
  +5.8 reference. Moving `day.shadowTint` most of the way to neutral bought
  **0.9 of those 15 points**, and that negative is recorded in
  `src/shaders/post/grades.ts`. The rest is the ambient probe. Do not re-tint.
- `vista_dusk` clips 14.1% against FFXV-golden's 16.0%, which is fine, but its
  median luma is 137.8 against 104.5. The mids sit a third of a stop high at
  golden hour and nobody has chased it.
- **Perf: three runs, and the certified one fails.** Two voided
  (`RULER_VALID: false`, floor 27% of the frame). The third certified —
  `RULER_VALID: true`, floor 22% — with **mean 166.4 fps and worst 51 fps on
  `bestiary_necromancer`** against a 60 fps target, where the stored baseline
  has that shot at 179.

  **Do not attribute it to this round's work without re-running.** That shot
  read 179 / 150 / 51 fps across the three runs, its baseline row already
  carried `p95 31.8 ms, max 133.2 ms`, and system load was ~4.5 from outside
  this repo throughout — `cleanup.mts` reports no orphans of ours, and perf
  takes the daemon's exclusive lease, so the contention is not something this
  repo can drain. Nothing landed this round is a plausible 30% frame cost: the
  bleach and the haze split are a handful of ALU ops, the toe and grain are
  LUT-bake-time with no runtime, and the camera adds one `heightAt` per frame.
  **Needs an idle machine.** Owned by **phase4's WS-0b**, with Wave 3's
  frame-cost split behind it.

## Files touched

`src/shaders/post/grades.ts`, `src/engine/postfx/GradePass.ts`,
`src/engine/PostFX.ts`, `src/world/sky/MaterialPatch.ts`, `src/world/Sky.ts`,
`src/characters/rig/Materials.ts`, `src/characters/enemies/RigBuilder.ts`,
`src/game/CameraRig.ts`, `src/tools/imagestats.mts`, `src/tools/imgdiff.mts`,
`src/tools/probes/camsweep.mts` (new), `project/noise-floors.json` (new).

Nothing in `src/world/veg/`, `src/world/terrain/` or `src/ui/` was touched —
`src/world/veg/` belongs to procedural-modeling.

## Shots that show the current state

- `tmp/shots/sp-base/` — the six graded shots before any of this.
- `tmp/shots/sp-l5/` — after the grade work. `vista_night.png` is the clearest
  single frame: 8.49 -> 11.68 stops, and it stopped reading hazy.
- `tmp/shots/abl/` — the golden-hour warmth ablation set that overturned the
  plan's own prescription for 3.3.
- `tmp/shots/amb3/` — the ambient ablation with exposure pinned (3.8).
