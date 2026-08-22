# Instruments — the measurement lane

Owner: the instruments agent (`PORT=5330`).
Contract: `docs/plans/2026-08-21-fable-sibling-ports.md` §2 Wave 1, minus §2.1
(determinism pinning, closed on `main` in `417ca86`).

## Done and verified

### §2.4 — the self-validating perf ruler

`src/tools/ruler.mts` is new: the *instrument* half of a frame-time
measurement, shared by `perf.mts` and `gameplay.mts`. Ported by translation
from `metal-gear-solid-5-opus-demo/tools/probes/perf.js` and that repo's
`tools/shot.mjs status` verdict.

- `printContention()` — headless-browser trees, vite processes, load average,
  which worktrees are live, and a VERDICT line. Printed **before** the browser
  launches, in both tools.
- `window.__RULER` (installed from `RULER_PAGE_SRC`): `throughput()` (median of
  pipelined blocks + block IQR), `paired()` (ABBA frame-paired adjacent
  differences, refusing |median| <= IQR), `noiseFloor()` (the same procedure
  with the same configuration on both sides).
- `validate()` — `RULER_VALID`, on two conditions: the bias must sit inside its
  own IQR **and** the floor must be under a quarter of the frame.
- `moved()` / `deltaVerdict()` — a median that moves less than the floor has
  not moved. Wired to `--baseline <file>` in both tools.

Both tools measure the floor **twice**, before the first shot/segment and after
the last, and judge against the worse of the two.

Exit codes: `0` pass, `2` below target, **`3` VOID** — and void outranks both.

**Measured on this tree, 2026-08-22, four agents live:**

| run | before | after |
|---|---|---|
| `perf.mts vista_dawn hero_full` | `vista_dawn 37.9 fps`, no error bar | floor IQR 4.77 ms at the start, **7.40 ms at the end**, 27% of a 27.7 ms frame -> `RULER_VALID: false`, exit 3, nothing certified |
| `gameplay.mts --scale 0.15` | `walk 49.8 fps`, no error bar | floor 3.65 ms = 24% of the median segment -> `RULER_VALID: true` (marginal); `strafe+camera` and `day-night-sweep` marked `~~` — verdict not resolvable |

That `perf.mts` refused to certify is the instrument working. The contention
verdict said CONTENDED both times; `gameplay` still validated, which is correct
— the verdict is a heuristic about the machine, `RULER_VALID` is measured
evidence about the run, and they are allowed to disagree.

**A finding worth acting on:** on `vista_dawn` the pipelined throughput (32.66
ms) is *no better* than the serialised per-frame latency (31.10 ms). A frame
that overlaps CPU and GPU should be meaningfully cheaper pipelined. It is not,
which says that shot is single-bottleneck (almost certainly GPU) and that
CPU-side work there will buy nothing. Both numbers now print side by side
(`thru` and `lat`) so this stays visible.

## Left

- §2.3 `seatHeightAt` / `drawnEnvelope` in `src/world/Terrain.ts`.
- §2.5 ablation dials (`?ablate=` seam, `--hide`/`--ablate` on `shoot.mts`),
  plus the rule in `BRIEF.md` / `project/HANDOFF.md`.
- §2.6 verify contact shadows ground the party at golden hour *by capture*
  before touching `ContactShadowPass.ts`.

## Exact next step

§2.3. Read `metal-gear-solid-5-opus-demo/src/world/Terrain.js`
(`seatHeightAt`, `clipSpacingAt`, `drawnEnvelope`) before writing anything.
`driftcheck.mts` already measures coarse-LOD spread (worst -1.177 m) and is the
verification.

## For the coordinator, once the tree is quiet

Run, in this order, with **no other agent's Chromium up**:

1. `node src/tools/perf.mts --out project/baseline-perf.json`
2. `node src/tools/gameplay.mts --out project/baseline-gameplay.json`

Both must print `RULER_VALID: true`; if either exits 3, the tree was not quiet
and the numbers must be thrown away, not discounted. Keep those two JSON files
— every later run should be `--baseline` against them, which is the only way
the "has not moved" rule can be applied.

## Files touched

`src/tools/ruler.mts` (new), `src/tools/perf.mts`, `src/tools/gameplay.mts`.

## Open questions

- `validate()` divides the floor by the **median** shot/segment frame time. The
  floor is measured on one configuration; judging it against the median of all
  of them is deliberately conservative but arguable. The printed line always
  names the denominator.
- `check.mts` (not mine) treats exit 3 as a plain FAIL in its table. The tail
  line says VOID, so it is legible, but a coordinator reading only PASS/FAIL
  would mistake a void run for a regression.
