// perf-r3: does the pacing artefact explain the POSED shots' `>16ms` tail too?
//
// `perfpace.mts` showed the menu stall is `setTimeout(0)` starving the
// browser's rendering lifecycle. `LANDMINES.md` records a second, older
// mystery in the same shape: "even paced at 60 Hz on a static shot, 12-31% of
// frames cost 20-90 ms instead of 5", which is the tail that puts `storm`'s
// median at its own edge and makes `perf.mts`'s corpus run print a false FAIL.
//
// Same shot, same page, minutes apart, only the inter-frame yield changes.
// Interleaved t0-raf-raf-t0 so drift cannot fake a winner.
const g = window.GAME;
const gl = g.renderer.getContext();
const shots = (window.__SHOTS || 'storm,zone_ravatogh,party_walk,town_npcs').split(',');
const YIELDS = {
  t0: () => new Promise((r) => setTimeout(r, 0)),
  raf: () => new Promise((r) => requestAnimationFrame(r)),
};

const run = async (shot, yieldName, n) => {
  const y = YIELDS[yieldName];
  g.resetClock(); g.applyShot(shot); g.settle(30);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  const w0 = performance.now();
  for (let i = 0; i < n; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    s.push(performance.now() - t0);
    await y();
  }
  const wall = performance.now() - w0;
  const so = [...s].sort((a, b) => a - b);
  return {
    shot, yield: yieldName,
    median: +so[n >> 1].toFixed(2),
    p95: +so[Math.floor(n * 0.95)].toFixed(2),
    max: +so[n - 1].toFixed(2),
    over16pct: +(100 * s.filter((x) => x > 16.7).length / n).toFixed(0),
    over33: s.filter((x) => x > 33).length,
    wallPerFrame: +(wall / n).toFixed(1),
  };
};

const N = 100;
const rows = [];
for (const shot of shots) {
  for (const arm of ['t0', 'raf', 'raf', 't0']) rows.push(await run(shot, arm, N));
}
return rows;
