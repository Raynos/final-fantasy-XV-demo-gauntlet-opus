// The raw per-frame time series, because four probes have now disagreed about
// what makes a static shot go from 5 ms to 25 ms and every one of them read a
// median rather than the shape.
//
// Conditions, all on the same shot, in one page, each after a 3 s rest:
//   A  finish after every frame, no sleeping        (300 frames)
//   B  finish after every frame, 10 ms sleep        (200 frames)
//   C  finish every 16th frame, no sleeping         (300 frames)
//   D  no rendering at all, just the sleep loop     (control for the clock)
//
// Printed as the full series, thinned to every 4th sample, so the onset frame
// and the shape are both visible instead of being averaged away.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

const rest = (ms) => new Promise((r) => setTimeout(r, ms));
g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);

const thin = (xs) => xs.filter((_, i) => i % 4 === 0).map((v) => +v.toFixed(1));

await rest(3000);
const A = [];
for (let i = 0; i < 300; i++) {
  const t0 = performance.now();
  g.frame(1 / 60);
  gl.finish();
  A.push(performance.now() - t0);
}

await rest(3000);
const B = [];
for (let i = 0; i < 200; i++) {
  const t0 = performance.now();
  g.frame(1 / 60);
  gl.finish();
  B.push(performance.now() - t0);
  await rest(10);
}

await rest(3000);
const C = [];
for (let b = 0; b < 19; b++) {
  gl.finish();
  const t0 = performance.now();
  for (let k = 0; k < 16; k++) g.frame(1 / 60);
  gl.finish();
  C.push((performance.now() - t0) / 16);
}

await rest(3000);
const D = [];
for (let i = 0; i < 60; i++) {
  const t0 = performance.now();
  await rest(10);
  D.push(performance.now() - t0);
}

return {
  shot,
  A_finishEachNoSleep: thin(A),
  B_finishEachSleep10: thin(B),
  C_finishEach16: C.map((v) => +v.toFixed(1)),
  D_sleepOnlyControl: thin(D),
};
