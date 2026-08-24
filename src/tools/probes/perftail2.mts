// perf-r2: what makes the tail fire?
//
// The `menu-open` stall is a switch: 0 spikes with no menu, 15-21 per 120
// frames with one, pure CPU inside `ScenePass`, no new programs, no uploads,
// the same draw count, on exactly every tenth frame. Everything in and around
// `Menus` has been ablated and come back innocent. So ablate the RENDERER
// instead, with the menu held open the whole time — one variable each, A-B-B-A.
//
//   shadows   `renderer.shadowMap.enabled = false`
//   csm       Sky's per-frame cascade update skipped
//   post      composer bypassed: `renderer.render(scene, camera)` only
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const sky = g.get('Sky');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const origCascades = sky && sky._updateCascades;
const origPostRender = g.post.render;
const camera = g.camera, scene = g.scene;

const pass = async (arm) => {
  // reset every arm
  g.renderer.shadowMap.enabled = true;
  if (sky && origCascades) sky._updateCascades = origCascades;
  g.post.render = origPostRender;

  if (arm === 'shadows-off') g.renderer.shadowMap.enabled = false;
  if (arm === 'csm-off' && sky && origCascades) sky._updateCascades = function () {};
  if (arm === 'post-off') g.post.render = function () { g.renderer.setRenderTarget(null); g.renderer.render(scene, camera); };

  menus.setScreen('main');
  for (let i = 0; i < 40; i++) g.frame(dt);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  for (let i = 0; i < 120; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 0));
  }
  const so = [...s].sort((a, b) => a - b);
  return { arm, medianMs: +so[60].toFixed(2), maxMs: +so[119].toFixed(2),
           over16: s.filter((x) => x > 16.7).length, over33: s.filter((x) => x > 33).length };
};
const out = [];
for (const a of ['base', 'shadows-off', 'csm-off', 'post-off', 'post-off', 'csm-off', 'shadows-off', 'base']) out.push(await pass(a));
g.renderer.shadowMap.enabled = true;
if (sky && origCascades) sky._updateCascades = origCascades;
g.post.render = origPostRender;
menus.setScreen(null);
const agg = {};
for (const r of out) { const a = agg[r.arm] || (agg[r.arm] = { over33: 0, over16: 0, max: 0, med: [] }); a.over33 += r.over33; a.over16 += r.over16; a.max = Math.max(a.max, r.maxMs); a.med.push(r.medianMs); }
return agg;
