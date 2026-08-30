# Lane 16 — Gates (cold-start brief)

Mission: plan tasks 46–48. Three instrument changes other lanes depend on —
ship 46 and 47 EARLY (lane 1 blocks on 47).

Owns: `src/tools/`.

## Anchors (verified)
- Bake-artifact gate (46): none of check.mts's 23 gates (:141-290) looks at
  `src/public/baked/`; the only existsSync is check-baseline.json (:858). A
  cold bake is treated as 41 s of latency (:306). `daemon.mts` already
  warns: bakedGeometry existsSync at :2751, WARNING prints at :2944-2952
  (geo + texc). Add a fast gate: assert
  src/public/baked/{terrain,tex,texc,geo}.bin.gz exist and are non-trivial
  size; red with a message naming `pnpm run build:full`. This gate would
  have caught the stale 85.5 MB first-load number.
- facecheck VOID (47): facecheck.mts:765-772 — voided heads (`clipped =
  mouth.mean > 212 || cheek.range > 60`) are skipped and the run still
  PASSes (:809-810). Known VOIDs documented at :145-195 (Gladiolus beard,
  Noctis fringe shadow). Make VOID a FAILURE (or a separate red row) so
  lane 1's "facecheck green" means the pixel rows actually ran. Expect
  lane 1 to fix the underlying heads; coordinate the flip so check isn't
  red overnight for a known cause — land the gate with a
  `--allow-void` escape the coordinator can drop later, default strict.
- NaN sweep (48): grep all shaders for unguarded `normalize(` and `pow(`
  with a varying base — both of this month's NaNs were operations
  undefined on their input (LANDMINES: trail ribbon pow(vUv.x<0), terrain
  normalize(vec3(0))). In-shader NaN tests fold away on this backend —
  test bits: `(floatBitsToUint(v) & 0x7f800000u) == 0x7f800000u &&
  (v_bits & 0x007fffffu) != 0u`. Findings go to the OWNING lane via
  project/TASKS.md rows, not fixed here (rule 4).
- Also useful early (from the plan's shot work): noise floors for any new
  judged shots come through `imgdiff.mts` floors
  (project/noise-floors.json, 20/142 measured, DEFAULT_LIMIT 2 at :229).

## Commands
- `pnpm run check` (the suite, tree-sha cached; `--no-cache` to force).
- `node src/tools/facecheck.mts` directly while changing it.
- `node src/tools/probe.mts src/tools/probes/nanscan.mts` after ANY shader
  finding lands elsewhere.

## First commits
1. Bake-artifact gate (small, immediate value).
2. facecheck VOID strictness + `--allow-void` escape, announced in
   project/handoff/ for lane 1.
3. NaN sweep report → TASKS.md rows per owner.

## Landmines
- A PASS is cached against the tree sha — after changing a gate, run with
  `--no-cache` once.
- Gates slow enough to skip get skipped: keep the bake gate < 100 ms.

## Done-when
check red on a missing bake artifact (verified by renaming one), facecheck
VOID visible as failure, NaN sweep filed per owner, nanscan 0/corpus.
