// Where does a longplay wall-minute actually go?
//
// Phase D of docs/plans/2026-08-24-opus-benchmaxx-harness.md opens with a
// discrepancy nobody had resolved. `longplay` is the one workload contention
// cannot explain — 421 s solo against 412 s contended, so it is pure CPU — and
// it costs **0.7–1.5 wall-minutes per game-minute**, stepping `g.frame(1/60)`
// 1 800 times per game-minute inside one `page.evaluate`. But `gameplay.mts`
// prices the simulation at 4.3–7.8 ms/frame, which predicts 0.26–0.47
// wall-min/game-min. Up to **half the bill is not the sim**, and the plan's
// first instruction is to find out what it is before optimising anything.
//
// Three candidates, separated here by ablation rather than by argument:
//
//   1. **Draw submission.** `Game.frame` ends with `post.update(t)` and
//      `post.render()`, so every stepped frame submits the whole scene — even
//      though a `?shoot=1` page never presents and nothing reads the pixels.
//      This is resolution-independent CPU, which is consistent with TIMINGS'
//      otherwise odd note that 640x360 is no faster and `--q` does nothing.
//   2. **The simulation itself**, which is the part that has to happen.
//   3. **GC**, which shows up as a widening gap between mean and worst.
//
// Method: warm, then time N frames with `post.render` intact, then N more with
// it swapped for a no-op, then restore. Same page, same world state, seconds
// apart — the ablation discipline `BRIEF.md` requires, and the only way to
// attribute a cost rather than guess at it.
//
// Run: node src/tools/probe.mts src/tools/probes/turbocost.mts
const g = window.GAME;
const N = Number(window.__TURBO_FRAMES || 900);

g.applyShot('hud_field');
g.get('Director')?.play?.();
g.get('CameraRig')?.clearShot?.();
g.resetClock();

const inp = g.input;
const heapOf = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);

/**
 * Time `N` frames, optionally with draw submission ablated.
 *
 * `post.update(t)` is kept in both arms: it is CPU bookkeeping (exposure
 * integrator, TAA jitter, the frame's uniform state) that gameplay can read,
 * and ablating it would measure a different game rather than the same game
 * drawn less. Only `render()` — the submission — is removed.
 */
function timed(draw) {
  const real = g.post.render;
  if (!draw) g.post.render = () => {};
  // Warm: the first frames after a shot change carry LOD pop-in, a shadow
  // cascade refresh and whatever the director set up, none of which is the
  // steady state this is trying to price.
  for (let i = 0; i < 120; i++) { inp.keys.clear(); inp.keys.add('KeyW'); g.frame(1 / 60); }
  const each = new Float64Array(N);
  const h0 = heapOf();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const a = performance.now();
    inp.keys.clear();
    inp.keys.add('KeyW');
    if ((i % 1800) < 1200) inp.keys.add('ShiftLeft');
    g.frame(1 / 60);
    each[i] = performance.now() - a;
  }
  const total = performance.now() - t0;
  const h1 = heapOf();
  if (!draw) g.post.render = real;
  const sorted = Array.from(each).sort((a, b) => a - b);
  return {
    meanMs: Number((total / N).toFixed(3)),
    p50Ms: Number(sorted[Math.floor(N * 0.5)].toFixed(3)),
    p99Ms: Number(sorted[Math.floor(N * 0.99)].toFixed(3)),
    worstMs: Number(sorted[N - 1].toFixed(3)),
    heapMB: Number(((h1 - h0) / 1e6).toFixed(1)),
    wallMinPerGameMin: Number(((total / N) * 3600 / 60000).toFixed(3)),
  };
}

// Draw-on FIRST, then draw-off, then draw-on again: an A/B/A, because the page
// warms as it runs and a one-way comparison would credit the ablation with the
// warm-up. `imgdiff`'s rule, applied to time.
const a1 = timed(true);
const b = timed(false);
const a2 = timed(true);

const drawMs = ((a1.meanMs + a2.meanMs) / 2) - b.meanMs;
const drift = Math.abs(a1.meanMs - a2.meanMs);

return {
  frames: N,
  drawOn: a1,
  drawOff: b,
  drawOnAgain: a2,
  /** Mean milliseconds per frame that submission costs. */
  drawSubmissionMs: Number(drawMs.toFixed(3)),
  drawShareOfFrame: Number((100 * drawMs / ((a1.meanMs + a2.meanMs) / 2)).toFixed(1)),
  /**
   * How far the two draw-on arms disagree.
   *
   * The floor under `drawSubmissionMs`: a difference smaller than this is the
   * page warming up, not the ablation. `ruler.mts`'s rule, in miniature.
   */
  abaDriftMs: Number(drift.toFixed(3)),
  verdict: drawMs > drift * 2
    ? `draw submission is ${drawMs.toFixed(2)} ms/frame, ${(100 * drawMs / ((a1.meanMs + a2.meanMs) / 2)).toFixed(0)}% of the frame — turbo is worth building`
    : `draw submission is within the A/B/A drift (${drift.toFixed(2)} ms) — turbo would buy nothing`,
};
