# Instruments — the measurement lane

Owner: the instruments agent (`PORT=5330`).
Contract: `docs/plans/2026-08-21-fable-sibling-ports.md` §2 Wave 1, minus §2.1
(determinism pinning, closed on `main` in `417ca86`).

All four items are done. Nothing is half-landed; each commit stands alone.

---

## §2.4 — the self-validating perf ruler — DONE

`src/tools/ruler.mts` is new: the *instrument* half of a frame-time measurement,
shared by `perf.mts` and `gameplay.mts`. Ported by translation from
`metal-gear-solid-5-opus-demo/tools/probes/perf.js` and that repo's
`tools/shot.mjs status` verdict.

- `printContention()` — headless-browser trees, vite processes, load average,
  which worktrees are live, and a VERDICT line. Printed **before** the browser
  launches, in both tools.
- `window.__RULER` (from `RULER_PAGE_SRC`): `throughput()` (median of pipelined
  blocks + block IQR), `paired()` (ABBA frame-paired adjacent differences,
  refusing |median| <= IQR), `noiseFloor()` (same procedure, same configuration
  on both sides).
- `validate()` — `RULER_VALID` on two conditions: the bias must sit inside its
  own IQR **and** the floor must be under a quarter of the frame.
- `moved()` / `deltaVerdict()` — a median that moves less than the floor has not
  moved. Wired to `--baseline <file>` in both tools.

Both tools measure the floor **twice**, before the first shot/segment and after
the last, and judge against the worse of the two. Exit codes: `0` pass, `2` below
target, **`3` VOID** — and void outranks both.

`perf.mts`'s headline is now `thru`, the median of five pipelined 16-frame
blocks, because that is how the game submits a frame. The old per-frame
`gl.finish()` median stays beside it as `lat`, because the tail (p95, max,
hitches) is only meaningful per frame.

**Measured on this tree, four agents live:**

| run | before | after |
|---|---|---|
| `perf.mts vista_dawn hero_full` | `vista_dawn 37.9 fps`, no error bar | floor IQR 4.77 ms at the start, **7.40 ms at the end**, 27% of a 27.7 ms frame -> `RULER_VALID: false`, exit 3, nothing certified |
| `gameplay.mts --scale 0.15` | `walk 49.8 fps`, no error bar | floor 3.65 ms = 24% of the median segment -> `RULER_VALID: true` (marginal); `strafe+camera` (64.6 fps, spread 1.6) and `day-night-sweep` (49.0, spread 3.8) marked `~~` — neither verdict is resolvable |

`perf.mts` refusing to certify is the instrument working. The contention verdict
said CONTENDED both times while `gameplay` still validated, which is correct: the
verdict is a heuristic about the machine, `RULER_VALID` is measured evidence
about the run, and they are allowed to disagree.

**Finding worth acting on:** on `vista_dawn` the pipelined throughput (32.66 ms)
is *no better* than the serialised per-frame latency (31.10 ms). A frame that
overlaps CPU and GPU should be meaningfully cheaper pipelined. It is not, so that
shot is single-bottleneck — almost certainly GPU — and CPU-side work there will
buy nothing.

## §2.3 — `seatHeightAt` / `drawnEnvelope` — DONE (API + proof; call sites handed off)

Five new methods on `Terrain`: `clipSpacingAt`, `clipSpacingForDistance`,
`drawnHeightAt`, `seatHeightAt`, `drawnEnvelope` (plus `_vertexHeight`,
`_latticeHeight`, `_ringVertexHeight`, `_drawnAtRing`).

`src/tools/seatcheck.mts` proves the model is the renderer's own arithmetic: it
renders the real clipmap meshes through the real vertex chunks into a float
target from above (the `driftcheck` rig) and compares every covered texel.
**Residual p99 0.000 m, worst -0.000 m, in every band from 60 m to 3.4 km.**

Getting there took three corrections, each a real difference between model and
renderer: coarse levels *low-pass* the field rather than decimating it
(`tf_heightLod`, a five-tap cross of width `(cell-4)*1.1`); the morph band is
worth 8.67 m of p99 residual on its own; and a quad is two triangles split on the
b-c diagonal in quadrant-*local* indices, so the split flips across each axis
through the ring centre. Plus one thing the sibling's version does not have: in
the four-cell ring overlap, both rings are drawn and the depth test picks the
higher — without that the residual was 3.28 m and all of it was in overlaps.

**The bug, sized.** `heightAt` vs the rasterised surface: 0.371 m worst at 60 m,
2.5 m at 300 m, 10.6 m at 600 m, 16.2 m at 1.2 km, 43.0 m at 1.7 km. And the
question a prop system has to answer — seated on `heightAt`, how far off the
drawn ground is a prop still visible at D metres, over the whole field:

|  D | ring | median |  p95 |   p99 | worst float | >0.25 m |
|---:|-----:|-------:|-----:|------:|------------:|--------:|
| 150 |  3.0 | 0.304 | 1.63 |  3.27 |  9.20 | 57% |
| 300 |  6.0 | 0.668 | 5.70 | 11.59 | 27.00 | 77% |
| 600 | 12.0 | 1.485 |14.06 | 28.18 | 64.19 | 87% |
|1200 | 24.0 | 2.720 |22.86 | 46.57 | 93.34 | 92% |

**A measured negative, and it matters.** `Shots.ts` opens with a load-bearing
workaround: character shots are filed first because "after a few dozen shots
kilometres away the terrain under the party renders roughly 1.5 m *above*
`heightAt`" and the party is buried to the shoulders. That is the shape of this
bug, so it was the obvious suspect. It is not the cause —
`probes/partyseat.mts` measures the party's spawn with the camera 5 m, 771 m,
3.26 km and 3.41 km away, and `drawn - heightAt` is **-0.05 m**, in the *wrong*
direction, at every distance. The spawn is a graded pan and a lattice chord
across flat ground is flat at every ring. Do not remove the shot-order
workaround on this evidence, but do not spend an afternoon on the clipmap either.

## §2.5 — ablation dials — DONE

`shoot.mts --ablate <tokens>` (through to `?post=`, and part of the daemon's
page identity so an ablated run can never be served an un-ablated frame),
`--hide <names>` (scene objects by case-insensitive name substring, applied
*after* the settle and restored after, and an error if it matches nothing), and
`--raw` (capture the scene render before the post chain).

`imgdiff.mts --heat <dir> [--gain N]` writes a grey map of *where* two frames
differ. Demonstrated: `hero_full --raw` against `--raw --hide grass` dropped
9.48 M triangles to 5.39 M and 757 draw calls to 493, and the heat map is grass
and nothing else — party silhouettes black, sky black. `tmp/shots/abl-heat/`.

The rule is written into `BRIEF.md` ("For any visual defect, ablate before
re-tinting", with the recipe) and into `project/HANDOFF.md` as method rule 2,
beside "agents must look at their own output".

## §2.6 — contact shadows — VERIFIED PRESENT, NO PORT NEEDED

Checked by capture first, as instructed. `party_dawn` and `hero_full` at golden
hour, with and without `--ablate nocontact`, diffed: mean 1.72–1.84/255 (at the
noise floor, because the effect is local) but **max 149 and 4.5% of pixels
moving more than 8/255**, and the heat map (`tmp/shots/cs-heat/`) shows the
change concentrated at the party's boots and along every sun-grazing terrain
edge. The characters themselves are black in the map — the pass darkens the
*ground* under them, which is what it is for.

So the pass is present, reached, and grounding the party. MGS5's sun-marched
version was not ported. Shots: `tmp/shots/cs-on/`, `tmp/shots/cs-off/`,
`tmp/shots/cs-heat/`, and the 2x feet crops `tmp/shots/cs-{on,off}-feet.png`.

One observation for whoever tunes it: a lot of the pass's energy goes into
terrain micro-relief (ruts, clods) rather than into actors. That is not wrong,
but if it ever needs to be cheaper, gating it toward actor depth is the lever.

---

## For the coordinator, once the tree is quiet

Run, in this order, with **no other agent's Chromium up** (check the VERDICT line
each tool prints before it measures):

1. `node src/tools/perf.mts --out project/baseline-perf.json`
2. `node src/tools/gameplay.mts --out project/baseline-gameplay.json`
3. `node src/tools/seatcheck.mts` (needs a server up on `PORT`; must stay
   `PASS`, residual 0.000 m — it is the regression test for the seating model)

Both perf runs must print `RULER_VALID: true`. If either exits 3, the tree was
not quiet: throw the numbers away, do not discount them. Keep the two JSON files
— every later run should be `--baseline` against them, which is the only way the
"has not moved" rule can be applied.

The two currently-failing gates (`vista_dawn` 37.9 fps, `walk` 49.8 fps) have not
been re-measured on a quiet tree and should be treated as unknown until they are.
Note the numbers will *change shape*, not just value: the headline moved from
serialised latency to pipelined throughput.

## For the props agent

The seating recipe, for anything placed once at boot:

```ts
const cell = terrain.clipSpacingForDistance(kind.cullDistance);
y = terrain.seatHeightAt(x, z, kind.size, cell);
```

Do **not** pass the live camera's spacing for static placement — a prop 6 km from
spawn is under the coarsest ring in the stack at build time and that has nothing
to do with how it will be seen. Everything currently routes through
`Ecology.height(x, z)`, which is `terrain.heightAt`; a `seat(x, z, size, dist)`
beside it is the one-line adapter, and then the per-kind cull distances are the
only real work. The table above says how much it is worth: median 0.30 m at a
150 m draw distance, 57% of the world over a quarter of a metre.

For anything that must stay *visible* lying on the ground — aprons, decals,
graded pads — use `drawnEnvelope`, the opposite bound. The sibling built an apron
on the lower bound and got 12,450 pixels inside the frustum with none of them
passing the depth test.

Separately: the Hammerhead apron landmine ("3.2 m above `heightAt`, anything
snapped to the heightfield ends up under the tarmac") is **not** this bug.
`Hammerhead._padHeight` grades a pad and publishes `this.base`; props inside the
pad footprint should seat on that, not on any terrain query. That is a town
change, not a terrain one.

## Files touched

`src/tools/ruler.mts` (new), `src/tools/seatcheck.mts` (new),
`src/tools/probes/partyseat.mts` (new), `src/tools/perf.mts`,
`src/tools/gameplay.mts`, `src/tools/shoot.mts`, `src/tools/daemon.mts`,
`src/tools/imgdiff.mts`, `src/world/Terrain.ts`, `BRIEF.md`,
`project/HANDOFF.md`.

## Open questions

- `validate()` divides the floor by the **median** shot/segment frame time. The
  floor is measured on one configuration; judging it against the median of all of
  them is deliberately conservative but arguable. The printed line always names
  the denominator.
- `check.mts` (not mine) renders exit 3 as a plain FAIL in its table. The tail
  line says VOID so it is legible, but a coordinator reading only the PASS/FAIL
  column would mistake a void run for a regression. A `VOID` column would be a
  five-line change there.
- `seatHeightAt`'s lower envelope includes `heightAt` itself, so where the drawn
  chord is *above* the field a prop sits up to that much under the visible
  ground. That is deliberate — the player's feet are on `heightAt` via collision,
  so props and characters are wrong in the same direction by the same amount,
  which reads as ground rather than as error. It is a choice, not a fact.
