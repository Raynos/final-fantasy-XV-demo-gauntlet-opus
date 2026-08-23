// How many frames may be in flight before the frame cost falls off a cliff?
//
// Three earlier probes converge on one mechanism. Rendering with a
// `gl.finish()` after every frame holds a static shot at ~5.5 ms indefinitely,
// with no sleeping at all. Rendering 16 frames between finishes -- which is
// exactly what `perf.mts`'s `throughput()` does -- settles at ~25 ms on the
// same shot with every renderer counter flat. Sleeping is irrelevant; queue
// depth is not. So thermal, duty cycle and GPU governor are all out, and the
// remaining candidate is how deep the command-buffer backlog is allowed to get.
//
// This sweeps the depth directly. A cliff between two adjacent depths names the
// mechanism; a smooth ramp means it is something else and this write-up is
// wrong.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

const rest = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);

const atDepth = async (d) => {
  await rest(400);                       // recovery needs ~200 ms; give it double
  const blocks = [];
  const total = Math.max(96, d * 6);     // same frame count at every depth
  for (let i = 0; i < total / d; i++) {
    gl.finish();
    const t0 = performance.now();
    for (let k = 0; k < d; k++) g.frame(1 / 60);
    gl.finish();
    blocks.push((performance.now() - t0) / d);
  }
  return +med(blocks.slice(blocks.length >> 1)).toFixed(2);   // second half only
};

const depth = {};
for (const d of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]) depth['d' + d] = await atDepth(d);

// Control: is it the finish that matters, or just the JS-side yield? Depth 16
// with a zero-length await between frames, and depth 16 with a gl.flush()
// between frames instead of a finish.
const variant = async (fn) => {
  await rest(400);
  const blocks = [];
  for (let i = 0; i < 6; i++) {
    gl.finish();
    const t0 = performance.now();
    for (let k = 0; k < 16; k++) await fn();
    gl.finish();
    blocks.push((performance.now() - t0) / 16);
  }
  return +med(blocks.slice(3)).toFixed(2);
};
const d16plainAwait = await variant(async () => { g.frame(1 / 60); await null; });
const d16flush = await variant(async () => { g.frame(1 / 60); gl.flush(); });
const d16fence = await variant(async () => {
  g.frame(1 / 60);
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.clientWaitSync(s, gl.SYNC_FLUSH_COMMANDS_BIT, 0);
  gl.deleteSync(s);
});

return { shot, msPerFrameByQueueDepth: depth, controlsAtDepth16: { d16plainAwait, d16flush, d16fence } };
