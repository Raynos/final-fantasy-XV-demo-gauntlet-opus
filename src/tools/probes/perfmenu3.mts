// perf-r2: inside the `menu-open` spike.
//
// Established so far: the spike is 100% correlated with a menu being open
// (0 hitches with no menu, 14-21 with one), survives hiding the menu's whole
// DOM subtree, is not the backdrop blur, and creates no programs, geometries
// or textures. This times every composer pass and every renderer counter on
// each frame so the spike can be located inside `post.render` rather than
// merely attributed to it.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

let cur = null;
const restore = [];
const passes = g.post && g.post.composer ? g.post.composer.passes : [];
passes.forEach((p, i) => {
  const name = (p.constructor && p.constructor.name) || ('pass' + i);
  const orig = p.render;
  restore.push(() => { p.render = orig; });
  p.render = function (...a) {
    const t0 = performance.now();
    const r = orig.apply(this, a);
    if (cur) cur[i + ':' + name] = +(performance.now() - t0).toFixed(2);
    return r;
  };
});

const script = (i) => {
  if (i === 5) menus.setScreen('main');
  if (i === 30) menus.setScreen('ascension');
  if (i === 55) menus.setScreen('inventory');
  if (i === 80) menus.setScreen(null);
};
menus.setScreen(null);
for (let i = 0; i < 20; i++) g.frame(dt);
gl.finish();
await new Promise((r) => setTimeout(r, 300));

const rows = [];
for (let i = 0; i < 90; i++) {
  script(i);
  gl.finish();
  cur = {};
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  const ms = performance.now() - t0;
  const inf = g.renderer.info;
  rows.push({ i, ms: +ms.toFixed(1), passes: cur,
    calls: inf.render.calls, tri: inf.render.triangles,
    prog: inf.programs.length, tex: inf.memory.textures, geo: inf.memory.geometries,
    enabled: passes.filter((p) => p.enabled !== false).length });
  cur = null;
  await new Promise((r) => setTimeout(r, 0));
}
restore.forEach((f) => f());
menus.setScreen(null);

const hot = rows.filter((r) => r.ms > 25);
const calm = rows.filter((r) => r.ms <= 12);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] || 0; };
const names = passes.map((p, i) => i + ':' + ((p.constructor && p.constructor.name) || ('pass' + i)));
const cmp = names.map((n) => ({
  pass: n,
  calmMs: +med(calm.map((r) => r.passes[n] || 0)).toFixed(2),
  hotMs: +med(hot.map((r) => r.passes[n] || 0)).toFixed(2),
})).sort((a, b) => (b.hotMs - b.calmMs) - (a.hotMs - a.calmMs));
return {
  hotFrames: hot.length, calmFrames: calm.length,
  hotIdx: hot.map((r) => r.i),
  counters: {
    calm: { calls: med(calm.map((r) => r.calls)), tri: med(calm.map((r) => r.tri)), enabled: med(calm.map((r) => r.enabled)) },
    hot: { calls: med(hot.map((r) => r.calls)), tri: med(hot.map((r) => r.tri)), enabled: med(hot.map((r) => r.enabled)) },
  },
  accounted: { calmMs: +cmp.reduce((a, r) => a + r.calmMs, 0).toFixed(2), hotMs: +cmp.reduce((a, r) => a + r.hotMs, 0).toFixed(2) },
  passes: cmp,
  sample: hot.slice(0, 3),
};
