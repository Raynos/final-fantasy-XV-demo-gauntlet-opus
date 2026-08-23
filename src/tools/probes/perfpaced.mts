// Is the 24 ms steady state a property of the frame, or of hammering the GPU
// with no gaps?
//
// `perfstep.mts` showed a static shot rendering at ~4.9 ms/frame for the first
// ~30 frames after any pause and at ~24 ms for ever after, with every renderer
// counter flat. A 3 s idle put it back to 4.9 ms. Nothing in the game changed,
// so the carrier is the measurement's own duty cycle -- and every number in
// `project/baseline-perf.json` was taken at 100% duty cycle, which is not how
// the game runs.
//
// Three conditions, same shot, same frames:
//   burst  -- back to back, what perf.mts does
//   paced  -- one frame per 16.7 ms of wall clock, what a 60 Hz game does
//   raf    -- driven by requestAnimationFrame, what the browser actually does
//
// and, where the driver exposes it, the GPU's own timer query, which is the
// only number of the four that cannot be lied to by queueing.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const gpuTime = async (frames) => {
  if (!ext) return null;
  const q = gl.createQuery();
  gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
  for (let i = 0; i < frames; i++) g.frame(1 / 60);
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
  }
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
  const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
  gl.deleteQuery(q);
  return disjoint ? null : +(ns / 1e6 / frames).toFixed(2);
};

const settleShot = () => {
  g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
};
const rest = () => new Promise((r) => setTimeout(r, 3000));

settleShot();

// --- burst: back to back, 8 blocks of 8 ---------------------------------
const burst = [];
for (let b = 0; b < 8; b++) {
  gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < 8; i++) g.frame(1 / 60);
  gl.finish();
  burst.push(+((performance.now() - t0) / 8).toFixed(2));
}

await rest();

// --- paced: one frame per 16.7 ms of wall clock, 64 frames --------------
// `cpu` is the time g.frame() itself takes; `late` counts frames that could
// not finish inside the budget, which is the only thing a 60 Hz game cares
// about.
const paced = [];
let late = 0;
for (let i = 0; i < 64; i++) {
  const t0 = performance.now();
  g.frame(1 / 60);
  gl.finish();
  const ms = performance.now() - t0;
  if (ms > 16.7) late++;
  if (i % 8 === 7) paced.push(+ms.toFixed(2));
  const spare = 16.7 - (performance.now() - t0);
  if (spare > 0) await new Promise((r) => setTimeout(r, spare));
}

await rest();

// --- raf: whatever cadence the browser gives us -------------------------
const rafMs = [];
await new Promise((done) => {
  let n = 0, prev = performance.now();
  const step = () => {
    const now = performance.now();
    if (n > 4) rafMs.push(+(now - prev).toFixed(2));
    prev = now;
    g.frame(1 / 60);
    if (++n < 60) requestAnimationFrame(step); else done(null);
  };
  requestAnimationFrame(step);
});

await rest();

// --- the GPU's own clock, cold and hot ----------------------------------
settleShot();
const gpuCold = await gpuTime(8);
for (let i = 0; i < 120; i++) g.frame(1 / 60);
gl.finish();
const gpuHot = await gpuTime(8);

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
return {
  shot,
  burstMs: burst,
  pacedEvery8thMs: paced,
  pacedLateFrames: late + '/64',
  rafIntervalMedianMs: rafMs.length ? med(rafMs) : null,
  rafFirst12: rafMs.slice(0, 12),
  timerQuery: ext ? { gpuColdMs: gpuCold, gpuHotMs: gpuHot } : 'EXT_disjoint_timer_query_webgl2 absent',
};
