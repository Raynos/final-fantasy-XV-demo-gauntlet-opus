// Where exactly is the 5 ms -> 27 ms step, and is it counted in frames or in
// seconds? `perfdrift.mts` showed a static shot rendering at 199 fps for two
// 16-frame blocks and then at 40 fps for ever after, with every renderer
// counter flat across the step. Two families of cause fit that: something in
// the game turns on at a certain frame/time, or the machine changes state
// (GPU clock, driver, memory) once enough work has gone through it.
//
// This separates them. Phase A times blocks of 4 frames from the very first
// one. Phase B then idles for 3 real seconds without rendering and times 4
// more blocks: if the step is wall-clock or thermal the idle moves it, if it
// is the workload's own state the idle changes nothing.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

g.resetClock();
g.applyShot(shot);
g.settle(40);
g.applyShot(shot);
g.settle(8);

const block = (n) => {
  gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) g.frame(1 / 60);
  gl.finish();
  return (performance.now() - t0) / n;
};

const a = [];
for (let b = 0; b < 24; b++) a.push(+block(4).toFixed(2));

await new Promise((r) => setTimeout(r, 3000));
const afterIdle = [];
for (let b = 0; b < 6; b++) afterIdle.push(+block(4).toFixed(2));

// And once more with the game clock frozen: if the step is driven by anything
// time-dependent in the sim, feeding dt=0 should reproduce or suppress it.
g.resetClock();
g.applyShot(shot);
g.settle(48);
const frozen = [];
for (let b = 0; b < 12; b++) {
  gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < 4; i++) g.frame(0);
  gl.finish();
  frozen.push(+((performance.now() - t0) / 4).toFixed(2));
}

return { shot, msPer4FrameBlock: a, after3sIdle: afterIdle, dtZeroAfterReset: frozen };
