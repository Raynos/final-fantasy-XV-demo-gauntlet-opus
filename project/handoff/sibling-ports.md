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
| `7419942` | the plan re-audit itself |

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
- `imgdiff --calibrate` + `project/noise-floors.json` — per-shot floors.
  Regenerate with two `--cold` captures of one build.

## Next step, exactly

**3.7 water depth model** is the one Wave 2 item nobody has touched — no
Beer-Lambert, no refracted bed, `src/world/Water.ts` is planar reflection only.
It is self-contained and has no dependency on anything above.

After that, in value order:

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
- **The perf re-baseline is still not certified.** Two runs on 2026-08-23
  returned `RULER_VALID: false` — noise floor 1.58 ms against a 5.9 ms frame,
  27%, with `cleanup.mts` reporting no orphans of ours and system load ~4.5.
  The machine has other work on it. The ruler refused rather than lying, which
  is 2.4 working. This item is argued into **phase4's WS-0b** in the plan.

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
