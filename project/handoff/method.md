# Method lane — the benches everything else is measured with

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` §9.1–9.6 and §13
`proudOf`. Coordinator: `project/handoff/2026-08-23-coordinator.md`.
Owns `src/tools/**` (not `scatterstat.mts`) and `src/world/props/Seat.ts`.

**Why this lane exists.** §9 opens: *"every scalar metric read clean while zero
correct pixels shipped."* This repo has caught the same disease seven times.
Every check here therefore ships with a **calibration pair whose answer is
already known**, measured on every run and printed, and with a line saying **what
it is blind to**.

---

## READ THIS IF YOU ARE ANOTHER LANE

### `node src/tools/silhouette.mts` — LANDED, use it now

Does your family of meshes actually have different *shapes*? Bare Node, ~3 s,
no browser, no daemon, no build ref — **it reads the working tree**, so it sees
your uncommitted edit, unlike every capture tool.

```
node src/tools/silhouette.mts                 # trees + enemies, gate
node src/tools/silhouette.mts --set trees
node src/tools/silhouette.mts --pairs enemy   # every pairwise distance
node src/tools/silhouette.mts --calibrate     # the two anchors alone
node src/tools/silhouette.mts --json tmp/sil.json
```

Metric: 8 azimuths over 180°, 24 bands over the mesh's **own** height, width /
height per band, RMS minimised over azimuth shift and mirror, in **percent of
height**. Pure scale scores 0. Pure yaw scores 0. Both are things `Ecology`
already gives you free, so a metric that counted them as variety would report a
varied world while shipping one tree.

Calibration, re-measured every run and printed at the top:

| anchor | what | today |
|---|---|---|
| known-same | broadleaf#4242 vs itself ×1.73, yawed 37° | **0.573** (true answer 0) |
| known-different | conifer vs savanna — a spire vs a parasol | **42.989** |
| dynamic range | must be ≥ 10× or the run is VOID | **75.1×** |
| threshold | geometric mean of the two anchors | **4.96** |

Sibling anchors for scale (same units): a single corestone rock scored 3.90, a
stack 6.1–8.3, and their conifer band went 2 → 6 distinct silhouettes.

**Today's table** (`tree:*` are 3 variants each, `enemy` is the 21 base species):

```
family                   n  distinct   min-d  mean-d  aspect   fill  crown-empty
enemy                  21     20     1.84   43.31    1.05    48%       1%  <-- collapsed
tree:broadleaf          3      3     8.97   14.21    0.97    38%       0%
tree:conifer            3      3     9.50   12.01    0.67    46%       0%
tree:dead               3      3    13.56   15.72    1.03    18%       3%
tree:duscae             3      3    16.72   21.32    1.15    39%       0%
tree:savanna            3      3    13.19   18.37    1.25    40%       0%
tree:swamp              3      3    23.18   25.31    1.33    58%       0%
tree:thicket            3      3    13.81   17.39    1.08    57%       0%
```

**It found a defect on its first run, and it is the characters lane's:
`irongiant` and `redgiant` are one silhouette** — 1.84, against a floor of
0.573. Distinct shapes in the shipped game; two recolours of one mesh here.
The next tightest cluster is the humanoid band, `anak`/`axeman`/`mt`/`irongiant`
at 7.5–10.6, which passes but is not comfortable.

That is recorded as **debt** in `project/silhouette-baseline.json`, not as a red
suite for somebody else's lane. The gate is a **ratchet** in the shape
`anycheck` already uses here: it fails on a **new** collapsed pair. Verified
both ways — exit 0 against the baseline, exit 1 with the baseline emptied.
When you fix a baseline pair the tool tells you to lower the ratchet with
`--set-baseline`.

`fill` and `crown-empty` are the **companion crown bench** and the paired half
per §9.3: the width profile is blind to interior structure, so a card cloud and
a real canopy can share an outline. `fill` separates them — a card cloud reads
~100%, our canopies read 38–58%.

**Blind to** (it prints this itself): colour and material; interior structure
(that is the `fill` column); anything below the outline (that is
`seatcheck`/`floatcheck`); winding and handedness (that is `geocheck`);
animation — enemies are measured in **bind pose**.

Wired into `pnpm run check` as a cheap gate, next to `anycheck` and `orphans`.

**Adding your family to it.** `treeSubjects()` / `enemySubjects()` in
`src/tools/silhouette.mts` are ten lines each; a subject is
`{ family, name, tris }` and `trisOfGeoms([...])` does the rest. Rocks are
deliberately *not* wired in yet — the rocks lane is rewriting `Rocks.ts`
tonight and I will not import a file being rebuilt under me. **Rocks lane: ask
and I will add `--set rocks`, or add it yourself, it is a ten-line function.**

### Still coming — the order and who is waiting

2. `proudOf` in `Seat.ts` + `floatcheck.mts`, the whole-POI-corpus floating
   instance gate. **Everyone placing props wants this.** (§13, half a done-box.)
3. `assertCardOrientation` / `downFacing` / tangent handedness (§9.1).
   **Water lane: your shore ribbon is exactly what this is for** — a strip
   generator is the construction whose winding nothing in the pipeline can
   report on. I will ping when it lands.
4. Material↔mesh attribute contract asserts (§9.5).
5. Blindness lines retrofitted onto the existing gates (§9.3).
6. Must-run entries for every generator landing tonight (§9.4).

### §9.4 — the wiring gate, and what I need from you

*"Built-but-unwired is this pipeline's chronic disease"* — ours too: 5,765 lines
of unwired RPG, and seven systems declared, documented and never executed.
`reachcheck.mts` + `project/must-run.json` already close most of it.

**Every lane landing a generator tonight: add its entry to
`project/must-run.json`** — the format is `"ClassName.method"`, one per line,
and `reachcheck` proves it actually *executed*, which `orphans` cannot. If you
are not sure what the entry should be, put the class and method in your handoff
and I will add it.

---

## Status

| item | state |
|---|---|
| §9.2 silhouette bench | **DONE**, gated, ratcheted, calibrated |
| §13 `proudOf` + floating-instance gate | in progress |
| §9.1 orientation/winding asserts | not started |
| §9.5 attribute contract | not started |
| §9.3 blindness lines on existing gates | not started |
| §9.4 must-run entries for tonight's generators | asked for above |
| §9.6 ablation + checkerboard positive control | not started |

## Files touched

- `src/tools/silhouette.mts` (new), `project/silhouette-baseline.json` (new),
  `src/tools/check.mts` (one gate row).

## Measured negatives and things learned

- **The first silhouette bench had a floor of 1.84 and could not have found the
  defect it found.** Aligning only over the 8 cyclic azimuth shifts means a mesh
  yawed between bins reads as different from itself, and 1.84 is also the
  distance between the two closest real meshes in the bestiary. Rastering at 32
  azimuths and aligning over all of them took the floor to 0.573 and the dynamic
  range from 23× to 75×. **This is the `imgdiff` global-noise-floor mistake, and
  I made it once before catching it by running the calibration.** It is the
  whole argument for the rule.
- **Bare Node imports our generators fine.** `TreeBuilder.ts` (53 ms) and the
  whole `Bestiary.ts` with 23 species (213 ms) both import and build geometry
  in plain `node`, type-stripping `.ts` directly, no DOM, no canvas. Any check
  over *shape* can and should be a bare-Node tool. Static `import` of a game
  module from a `.mts` tool also typechecks clean under `tsconfig.tools.json`.
