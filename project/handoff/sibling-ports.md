# Sibling-repo ports — handoff

Owner: opus, 2026-08-25 (third pass). Plan:
`docs/plans/2026-08-21-fable-sibling-ports.md` — its table is the authority,
this file is the working state.

## Where the plan stands

**Waves 1, 2 and 4 are complete. Wave 3's frame-cost split and the perf
re-baseline are the only open box**, and both wait on the same number.

Five of the previous pass's rows were wrong, all in the same direction — work
called open that was already in the tree. If you read nothing else here, read
"Read the file" below, because it is the fourth session in a row where that was
the cheapest thing anyone could have done.

## Done and verified this pass

| commit | what |
|---|---|
| `43531db` | daemon: the quiet lane is queueable — `--wait-lease`, FIFO, no more `already held by` + stack trace |
| `bdbd7c5` | sky: one diffuse ambient, an L2 SH probe; env cube demoted to specular-only (3.8(a)) |
| `43bcec6` | sky: the ground bounce was being cancelled by its own input; SH ringing clamped |
| `ebb5462` | sky: `PROBE_GAIN` is not a brightness knob, with the measurement that says so |
| `4c2c8de` | rig: the animation-rate contract, measured — worst sign-flip 8.3% |
| `b29d566` | enemies: a firefight with gaps in it, and the reason it had none (Wave 4) |
| (this pass) | harness: a timing tool no longer deadlocks against its own lease |

## New instruments — use these before re-deriving anything

- **`probes/skyprobe.mts`** — probe irradiance at six cardinal normals, at four
  hours. Both of 3.8(a)'s bugs came out of this and *neither* was visible in a
  frame. Run it before touching `PROBE_GAIN`, `GROUND_BOUNCE` or the horizon
  feather.
- **`probes/ratecontract.mts`** — sign-flip rate per bone per axis over 240
  fixed steps with the party walking. This is the check to re-run after any
  posture or gait work; a rig that differentiates its render transform sits at
  40-63%, we are at 8.3%.
- **`probes/firerhythm.mts`** — asks *separately* whether the ranged fire model
  is wired, whether it changes an answer, and whether it is visible. Its
  by-attack count is the line that found the real defect; all three checks
  passed on a model nobody was using.
- **`?post=noprobe`** — reverses the whole of 3.8(a) from one build: SH probe
  off, env-cube diffuse back on. The A/B has to come from one tree or the
  comparison carries whatever else moved between two commits.
- `--wait-lease <sec>` on `perf` / `gameplay` / `bootprof`; default 600, `0`
  restores fail-fast. `daemon.mts --health` prints `exclusiveQueue`.

Still current from the previous pass: `?post=nobleach` (scene-referred, so
`nolut` does not ablate it), `?post=noactorhaze`, `?post=noambient` /
`?post=noenv` **paired with `?post=noexp`**, `probes/camsweep.mts`,
`probes/conceal.mts`, `imgdiff --calibrate`.

## Traps this pass paid for

- **Closed-loop exposure hides anything you do to the ambient.** Known for the
  dials; it is also true of the probe's own gain. `PROBE_GAIN` 1.0 -> 0.80 made
  the frame *brighter* (mean luma 114.8 -> 115.3, clipping 2.81% -> 2.94%).
  Pin exposure or you will measure the loop, not the change.
- **The dome's below-horizon texels are not ground.** They are horizon haze
  dimmed to 0.55 — blue, and already through the atmosphere on the way to the
  eye. Multiplying them by a warm albedo returns grey, measured at R−B +0.9.
  Ground bounce has to be *substituted*, `E·albedo/π`.
- **`shGetIrradianceAt` does not clamp**, and an L2 fit of a bright-above /
  black-below sky rings negative. Downward normals were having light
  subtracted.
- **One identity derived two ways in two places.** `withExclusive` took the
  lease under the tool's name while the tool's jobs went in under `--agent`.
  They agreed by accident for months because `harnessArgs` defaults the agent to
  the tool's basename. `perf.mts --agent sibling` hung for thirteen minutes with
  no browser, no output and no error, holding the lease against the whole repo.
- **A probe that returns a clean negative for a wrong property name** is the
  same failure class it exists to catch. `ratecontract.mts` said "no bones found
  on any party member" because they live on `character.rig`, not
  `character.skeleton`.

## Read the file

Five more rows this pass, on top of the three already recorded:

| row | said | was |
|---|---|---|
| 3.6 tier-D | "not built yet, deliberately" | built, twice over — sward *and* dry cover, `TerrainMaterial.ts:1231` |
| 3.6 root blend | open | `GROUND_BLEED = 0.34`, measured |
| 3.8(b) Vogel disc | "port it" | shipped in three 0.185's own PCF branch |
| Wave 4 `setMotion` | untouched | satisfied by construction; now measured at 8.3% |
| Wave 4 adaptive music | untouched | `Score.setIntensity`, driven from proximity and remaining HP |

And one wrong *diagnosis*, which is the more expensive kind: the daylight
grade's shadow-warmth miss was attributed to the ambient probe across two
handoffs. Ablating the entire diffuse ambient under pinned exposure moves that
row **2.6 points of a 15-point gap**. `imagestats.mts`'s own docstring says why
— outdoors the darkest quartile is mostly ground, so `sh(R−B)` is dominated by
terrain and vegetation albedo. **It is a ground-albedo row and always was.**

## Next step, exactly

1. **The perf re-baseline, then Wave 3's frame-cost split.** The one open box.
   `perf.mts --agent <you>` now works; the ruler prints its own contention
   verdict, and `--wait-lease` means you can queue behind another agent rather
   than measuring on top of them. The split (pixel-scaled vs fixed cost) is
   what decides whether the walk-segment fix is shadows, post consolidation or
   render scale, and post consolidation is gated on its answer.
2. **Re-file the shadow-warmth row against ground albedo**, not the ambient.
   The daylight slice reads `sh(R−B) −9.2` against a `+5.8` reference and the
   whole ambient is worth 2.6 of it.
3. **3.6 coverage economics**, the last unbuilt item in Wave 2 — and the
   tier-D comment block already says to widen the term's *reach* before
   touching its colour again. It is gated on the grass splat weight AND a
   100-185 m ramp AND `bioGreen` simultaneously, and moves 0.037 mean/255 over
   0.006% of pixels.
4. **Occluding indirect diffuse.** 3.8(a) fixed the aimability and the
   double-count, not the occlusion: a `LightProbe` is no more shadowed than the
   env cube was, because our GTAO is a post multiply on the composited frame
   rather than AO bound in-material. That is a real, separate change and this
   plan does not claim it.

## Files touched

`src/world/sky/SkyProbe.ts` (new), `src/world/Sky.ts`,
`src/world/sky/MaterialPatch.ts`, `src/world/Water.ts`, `src/world/Weather.ts`,
`src/world/dungeons/Dungeons.ts`, `src/characters/enemies/EnemyBase.ts`,
`src/characters/enemies/MTSoldier.ts`,
`src/characters/enemies/ImperialSniper.ts`,
`src/game/encounters/EncounterDirector.ts`, `src/tools/daemon.mts`,
`src/tools/harness.mts`, `src/tools/README.md`,
`src/tools/probes/{skyprobe,ratecontract,firerhythm}.mts` (new).

Nothing in `src/world/veg/` — it belongs to procedural-modeling, and 3.6 turned
out not to need it.

## Shots that show the current state

- `tmp/shots/probe-off/` vs `tmp/shots/probe-on/` — 3.8(a)'s A/B from one
  build. `zone_longwythe` is the clearest single pair: 8.83 -> 10.60 stops,
  black point 6.6 -> 2.0.
- `tmp/shots/probe-g2/` — after the ground-bounce fix.
- `tmp/shots/look/` — the JPEG review set actually looked at.
