// Does the duty-cycle throttle scale every shot by the same factor?
//
// If it does, `project/baseline-perf.json` is pessimistic in absolute terms but
// still ranks shots correctly, and the attribution work can proceed on burst
// numbers. If it does not, the ranking itself is an artifact of how hard the
// tool hammers the GPU and no shot can be compared to another.
//
// Four shots spanning the baseline's whole range, each measured cold (first
// block after a 3 s rest), hot (steady state under 100% duty cycle) and paced
// (one frame per 16.7 ms wall clock, which is what the game does at 60 Hz).
const g = window.GAME;
const gl = g.renderer.getContext();
const SHOTS = ['vista_noon', 'party_walk', 'vista_dawn', 'setpiece_deadeye'];

const rest = () => new Promise((r) => setTimeout(r, 3000));
const block = (n) => {
  gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) g.frame(1 / 60);
  gl.finish();
  return (performance.now() - t0) / n;
};
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

const out = [];
for (const shot of SHOTS) {
  g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
  await rest();

  const cold = block(8);                        // first work after an idle GPU
  for (let i = 0; i < 96; i++) g.frame(1 / 60); // drive it to steady state
  const hot = med([block(8), block(8), block(8), block(8), block(8)]);

  await rest();
  const pacedSamples = [];
  for (let i = 0; i < 80; i++) {
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    const ms = performance.now() - t0;
    if (i >= 16) pacedSamples.push(ms);
    const spare = 16.7 - (performance.now() - t0);
    if (spare > 0) await new Promise((r) => setTimeout(r, spare));
  }
  const paced = med(pacedSamples);

  out.push({
    shot,
    coldMs: +cold.toFixed(2),
    hotMs: +hot.toFixed(2),
    pacedMs: +paced.toFixed(2),
    hotOverPaced: +(hot / paced).toFixed(2),
    draws: g.renderer.info.render.calls,
    mtris: +(g.renderer.info.render.triangles / 1e6).toFixed(2),
  });
}
return out;
