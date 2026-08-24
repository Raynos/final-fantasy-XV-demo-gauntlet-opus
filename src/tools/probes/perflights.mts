// perf-r2: does the visible LIGHT COUNT move on the spike frames?
//
// `LightBudget`'s own docstring is the whole hypothesis: three bakes
// numPointLights/numSpotLights into every lit program's cache key, so a count
// that changes invalidates every material's cached program. Re-resolving 269
// programs is pure CPU inside `ScenePass`, adds no draw calls and compiles
// nothing new -- exactly the fingerprint measured. This counts visible point
// and spot lights (ancestor visibility included, as three does) each frame and
// correlates the count with the frame cost, menu open and closed.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const visible = (o) => { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };
const count = () => {
  let point = 0, spot = 0, dir = 0;
  g.scene.traverse((o) => {
    if (!o.isLight || !visible(o)) return;
    if (o.isPointLight) point++;
    else if (o.isSpotLight) spot++;
    else if (o.isDirectionalLight) dir++;
  });
  return { point, spot, dir };
};

const pass = async (open) => {
  menus.setScreen(open ? 'main' : null);
  for (let i = 0; i < 40; i++) g.frame(dt);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const rows = [];
  for (let i = 0; i < 120; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    const ms = performance.now() - t0;
    rows.push({ i, ms: +ms.toFixed(1), ...count() });
    await new Promise((r) => setTimeout(r, 0));
  }
  const changed = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].point !== rows[i - 1].point || rows[i].spot !== rows[i - 1].spot || rows[i].dir !== rows[i - 1].dir) {
      changed.push({ i, from: `${rows[i - 1].point}/${rows[i - 1].spot}/${rows[i - 1].dir}`, to: `${rows[i].point}/${rows[i].spot}/${rows[i].dir}`, ms: rows[i].ms });
    }
  }
  const hot = rows.filter((r) => r.ms > 25).map((r) => r.i);
  const changedIdx = new Set(changed.map((c) => c.i));
  return {
    open, hotFrames: hot.length, hotIdx: hot.slice(0, 12),
    lightCountChanges: changed.length,
    changeSample: changed.slice(0, 12),
    hotFramesThatAlsoChangedCount: hot.filter((i) => changedIdx.has(i)).length,
  };
};
const out = [await pass(false), await pass(true), await pass(true), await pass(false)];
menus.setScreen(null);
return out;
