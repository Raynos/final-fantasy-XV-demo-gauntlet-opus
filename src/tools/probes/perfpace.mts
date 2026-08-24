// perf-r3: the menu stall is the loop starving the browser's compositor.
//
// `gcwatch.mts` measured it from outside the page: on a 312 ms frame the
// renderer main thread burns 10.9 ms of CDP `ThreadTime` and 10.8 ms of
// `TaskDuration`. The frame is BLOCKED, not working -- and 50 ms of real idle
// per frame removes every spike. This asks the only question that matters for
// the gate: which inter-frame yield does the game's own pacing look like, and
// does the stall survive it.
//
// Arms, all with the pause menu held open, same page, interleaved:
//   t0    setTimeout(r, 0)          -- what `ruler.yieldTask` does today
//   t1    setTimeout(r, 1)
//   raf   requestAnimationFrame     -- what the shipped game loop does
//
// A stall that only exists under `setTimeout(0)` is an artefact of the ruler,
// not a cost the player pays.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');

const YIELDS = {
  t0: () => new Promise((r) => setTimeout(r, 0)),
  t1: () => new Promise((r) => setTimeout(r, 1)),
  raf: () => new Promise((r) => requestAnimationFrame(r)),
};

g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const run = async (open, yieldName, n) => {
  const y = YIELDS[yieldName];
  menus.setScreen(null);
  for (let i = 0; i < 20; i++) g.frame(dt);
  if (open) { menus.setScreen('main'); for (let i = 0; i < 40; i++) g.frame(dt); }
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [], wall = [];
  const w0 = performance.now();
  for (let i = 0; i < n; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    await y();
  }
  const walltime = performance.now() - w0;
  const so = [...s].sort((a, b) => a - b);
  return {
    arm: (open ? 'menu ' : 'none ') + yieldName,
    median: +so[n >> 1].toFixed(2),
    p95: +so[Math.floor(n * 0.95)].toFixed(2),
    max: +so[n - 1].toFixed(2),
    over16: s.filter((x) => x > 16.7).length,
    over33: s.filter((x) => x > 33).length,
    wallPerFrameMs: +(walltime / n).toFixed(2),
    spikeAt: s.map((x, i) => (x > 33 ? i : -1)).filter((i) => i >= 0).slice(0, 14),
  };
};

const N = 120;
const rows = [];
// interleaved A-B-C-C-B-A so drift cannot fake a winner
for (const arm of ['t0', 't1', 'raf', 'raf', 't1', 't0']) rows.push(await run(true, arm, N));
for (const arm of ['t0', 'raf']) rows.push(await run(false, arm, N));
menus.setScreen(null);
return rows;
