// Falsification test for the paced-vs-burst result.
//
// `perfduty.mts` says every shot costs 4.3-6.0 ms when frames are paced at
// 60 Hz and 15.9-31.1 ms when they are rendered back to back, which would make
// `project/baseline-perf.json` a measurement of the GPU's sustained-load
// governor rather than of our frame. That conclusion is far too convenient to
// accept on one experiment, so this tries to break it three ways.
//
//  1. WORK SCALING. If the paced 6 ms is a real measurement, rendering the
//     scene twice inside one paced slot must cost about twice as much. If it
//     comes back at 6 ms again the clock is lying and the whole result dies.
//  2. BUDGET SWEEP. Where does the throttle switch on? Pace the same shot at
//     budgets from 0 (burst) up to 33 ms and watch the cost per frame.
//  3. RECOVERY. After a long burst, does one rest restore the fast state
//     immediately, or does it decay back over many frames?
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

const rest = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

const settleShot = () => {
  g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
};

// Pace `n` frames at `budget` ms of wall clock each, rendering `reps` frames
// per slot. Returns the median measured cost of one slot.
const pace = async (n, budget, reps) => {
  const s = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) g.frame(1 / 60);
    gl.finish();
    const ms = performance.now() - t0;
    if (i >= Math.min(16, n >> 2)) s.push(ms);
    const spare = budget - (performance.now() - t0);
    if (spare > 0) await rest(spare);
  }
  return +med(s).toFixed(2);
};

settleShot();

// --- 1. work scaling at a fixed 33 ms budget ----------------------------
// 33 ms so that even 4 renders have room to finish inside the slot; if they
// do not, the slot degenerates into a burst and the test says nothing.
await rest(3000);
const scaling = {};
for (const reps of [1, 2, 4]) {
  await rest(2000);
  scaling['x' + reps] = await pace(48, 33.4, reps);
}

// --- 2. budget sweep ----------------------------------------------------
const sweep = {};
for (const budget of [0, 8, 12, 16.7, 25, 33.4]) {
  await rest(3000);
  sweep[budget + 'ms'] = await pace(64, budget, 1);
}

// --- 3. recovery after a long burst -------------------------------------
await rest(3000);
for (let i = 0; i < 240; i++) g.frame(1 / 60);
gl.finish();
const hotAfterBurst = await pace(8, 0, 1);
const recovery = [];
for (const restMs of [50, 200, 1000, 3000]) {
  await rest(restMs);
  recovery.push({ restMs, firstBlockMs: await pace(4, 0, 1) });
}

return {
  shot,
  workScalingAt33msBudget: scaling,
  budgetSweepMsPerFrame: sweep,
  hotAfterBurstMs: hotAfterBurst,
  recovery,
};
