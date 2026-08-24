// perf-r2: the menu stall is pure CPU inside ScenePass (gl.finish() costs 0 on
// the spike frames, the JS of `post.render` owns 108 of the 109 ms). Same draw
// calls, same triangles, no new programs/textures/geometries. That leaves
// garbage collection: `performance.memory.usedJSHeapSize` falling across a
// spike frame is the signature, and a menu rewrites a dozen style strings and
// several `toFixed()` allocations every frame.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();
const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : -1);

const pass = async (open) => {
  menus.setScreen(open ? 'main' : null);
  for (let i = 0; i < 40; i++) g.frame(dt);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const rows = [];
  let m0 = mem();
  for (let i = 0; i < 120; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    const ms = performance.now() - t0;
    const m1 = mem();
    rows.push({ i, ms: +ms.toFixed(1), dHeapKB: Math.round((m1 - m0) / 1024) });
    m0 = m1;
    await new Promise((r) => setTimeout(r, 0));
  }
  const hot = rows.filter((r) => r.ms > 25);
  const calm = rows.filter((r) => r.ms <= 12);
  const avg = (xs, k) => (xs.length ? Math.round(xs.reduce((a, b) => a + b[k], 0) / xs.length) : 0);
  return {
    open, hotFrames: hot.length,
    allocPerCalmFrameKB: avg(calm, 'dHeapKB'),
    heapDeltaOnHotKB: avg(hot, 'dHeapKB'),
    heapFellOnHot: hot.filter((r) => r.dHeapKB < -1000).length,
    hotSample: hot.slice(0, 6),
    heapMB: +(mem() / 1048576).toFixed(1),
  };
};
const out = [await pass(false), await pass(true), await pass(true), await pass(false)];
menus.setScreen(null);
return out;
