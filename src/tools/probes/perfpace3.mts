// perf-r3: does rAF pacing change `streaming-traverse`, or is that the machine?
//
// The gate's worst segment moved 16.1 -> 19.9-22.7 ms across the commit that
// changed `ruler.yieldTask` from `setTimeout(0)` to `requestAnimationFrame`.
// Whole-run before/after cannot answer that here: every other segment moved
// too, in both directions, and an external process on the box was taking 60%
// of a core. So this is the house style for a moving machine -- the SAME
// script, the SAME page, one build, the two pacings interleaved A-B-B-A-A-B.
//
// The script is `gameplay.mts`'s `streaming-traverse` segment verbatim: sprint
// held, and a 660 m teleport hop every twelfth frame.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const hold = (...c) => { inp.keys.clear(); for (const k of c) inp.keys.add(k); };

const YIELDS = {
  t0: () => new Promise((r) => setTimeout(r, 0)),
  raf: () => new Promise((r) => requestAnimationFrame(r)),
};

const each = (i) => {
  if (i % 12 === 0 && player) {
    const a = i * 0.7;
    player.root.position.x = Math.cos(a) * (120 + i * 3);
    player.root.position.z = Math.sin(a) * (120 + i * 3);
  }
};

g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
const home = player ? player.position.clone() : null;

const run = async (yieldName, n, control) => {
  const y = YIELDS[yieldName];
  g.get('Director') && g.get('Director').setScenario && g.get('Director').setScenario('field');
  // The control arm is the SAME page and the same pacing with the streaming
  // script removed: stand still, no teleport hops. If the control degrades
  // alongside the traverse arms the drift is the machine, not the workload,
  // and no A/B taken across it means anything.
  const step = control ? () => {} : each;
  hold(control ? undefined : 'KeyW', control ? undefined : 'ShiftLeft');
  if (control) hold();
  if (home && player) player.root.position.copy(home);
  for (let i = 0; i < 6; i++) { step(i); g.frame(dt); }
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  const w0 = performance.now();
  for (let i = 0; i < n; i++) {
    step(i);
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    await y();
  }
  const wall = performance.now() - w0;
  const so = [...s].sort((a, b) => a - b);
  const inf = g.renderer.info;
  return {
    yield: (control ? 'ctl-' : '') + yieldName,
    draws: inf.render.calls,
    triM: +(inf.render.triangles / 1e6).toFixed(2),
    geos: inf.memory.geometries,
    texs: inf.memory.textures,
    progs: (inf.programs || []).length,
    median: +so[n >> 1].toFixed(2),
    p95: +so[Math.floor(n * 0.95)].toFixed(2),
    max: +so[n - 1].toFixed(2),
    over16pct: +(100 * s.filter((x) => x > 16.7).length / n).toFixed(0),
    over33: s.filter((x) => x > 33).length,
    wallPerFrame: +(wall / n).toFixed(1),
  };
};

const rows = [];
for (const arm of ['ctl', 't0', 'raf', 'ctl', 'raf', 't0', 'ctl', 't0', 'raf', 'ctl']) {
  rows.push(await run(arm === 'ctl' ? 'raf' : arm, 180, arm === 'ctl'));
}
if (home && player) player.root.position.copy(home);
hold();
const med = (k) => {
  const xs = rows.filter((r) => r.yield === k).map((r) => r.median).sort((a, b) => a - b);
  return xs[1];
};
return { rows, medianOf3: { t0: med('t0'), raf: med('raf') } };
