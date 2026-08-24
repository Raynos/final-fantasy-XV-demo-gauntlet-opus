// perf-r2: the spike lands every 10th frame, inside ScenePass, on the CPU,
// with no new programs and no extra draws. `Sky._preRender` runs inside
// ScenePass and is the only thing there with a frame cadence: cascade strides,
// `csm.updateFrustums()` (which re-flags every CSM-managed material) and the
// cloud shadow's `(frame & 3)`. Time each of them per frame.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const sky = g.get('Sky');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

let cur = null;
const restore = [];
const wrap = (obj, key, label) => {
  if (!obj || typeof obj[key] !== 'function') return;
  const orig = obj[key];
  restore.push(() => { obj[key] = orig; });
  obj[key] = function (...a) {
    const t0 = performance.now();
    const r = orig.apply(this, a);
    if (cur) cur[label] = (cur[label] || 0) + (performance.now() - t0);
    return r;
  };
};
wrap(sky, '_preRender', 'Sky._preRender');
wrap(sky, '_updateCascades', 'Sky._updateCascades');
wrap(sky, '_nearGround', 'Sky._nearGround');
if (sky && sky.csm) { wrap(sky.csm, 'updateFrustums', 'csm.updateFrustums'); wrap(sky.csm, 'update', 'csm.update'); wrap(sky.csm, 'updateUniforms', 'csm.updateUniforms'); }
if (sky && sky.clouds) { wrap(sky.clouds, 'render', 'clouds.render'); wrap(sky.clouds, 'renderShadow', 'clouds.renderShadow'); }
const rend = g.renderer;
wrap(rend.shadowMap, 'render', 'shadowMap.render');

const pass = async (open) => {
  menus.setScreen(open ? 'main' : null);
  for (let i = 0; i < 40; i++) g.frame(dt);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const rows = [];
  for (let i = 0; i < 120; i++) {
    gl.finish();
    cur = {};
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    const ms = performance.now() - t0;
    rows.push({ i, ms: +ms.toFixed(1), p: cur, shadowUpd: sky && sky.csm ? sky.csm.lights.map((l) => (l.shadow.needsUpdate ? 1 : 0)).join('') : '' });
    cur = null;
    await new Promise((r) => setTimeout(r, 0));
  }
  const hot = rows.filter((r) => r.ms > 25);
  const calm = rows.filter((r) => r.ms <= 12);
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.p)))];
  const med = (xs, k) => { const s = xs.map((r) => r.p[k] || 0).sort((a, b) => a - b); return s.length ? +s[s.length >> 1].toFixed(2) : 0; };
  return {
    open, hotFrames: hot.length, hotIdx: hot.map((r) => r.i).slice(0, 10),
    rows: keys.map((k) => ({ k, calmMs: med(calm, k), hotMs: med(hot, k) })).sort((a, b) => (b.hotMs - b.calmMs) - (a.hotMs - a.calmMs)),
    hotSample: hot.slice(0, 3).map((r) => ({ i: r.i, ms: r.ms, p: r.p, shadowUpd: r.shadowUpd })),
  };
};
const out = [await pass(false), await pass(true)];
restore.forEach((f) => f());
menus.setScreen(null);
return out;
