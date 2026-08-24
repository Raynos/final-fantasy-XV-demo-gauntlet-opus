// perf-r2: is the menu stall CPU (three.js submission) or GPU (the driver)?
//
// Times, per frame: the JS of `post.render` with NO finish inside it, then a
// bare `gl.finish()` immediately after. If the cost lands on the finish, the
// commands were submitted cheaply and the GPU is the one stalling; if it lands
// on the JS, it is three.js/ANGLE on the CPU. Same 90 frames with the menu
// open and closed.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

let jsMs = 0;
const orig = g.post.render;
g.post.render = function (...a) {
  const t0 = performance.now();
  const r = orig.apply(this, a);
  jsMs = performance.now() - t0;
  return r;
};

const pass = async (open) => {
  menus.setScreen(open ? 'main' : null);
  for (let i = 0; i < 40; i++) g.frame(dt);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const rows = [];
  for (let i = 0; i < 90; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    const tSubmit = performance.now() - t0;
    const t1 = performance.now();
    gl.finish();
    const tFinish = performance.now() - t1;
    rows.push({ submit: +tSubmit.toFixed(1), finish: +tFinish.toFixed(1), js: +jsMs.toFixed(1) });
    await new Promise((r) => setTimeout(r, 0));
  }
  const hot = rows.filter((r) => r.submit + r.finish > 25);
  const calm = rows.filter((r) => r.submit + r.finish <= 12);
  const med = (xs, k) => { const s = xs.map((r) => r[k]).sort((a, b) => a - b); return s.length ? +s[s.length >> 1].toFixed(1) : 0; };
  return {
    open, hot: hot.length, calm: calm.length,
    calmSubmit: med(calm, 'submit'), calmFinish: med(calm, 'finish'), calmPostJs: med(calm, 'js'),
    hotSubmit: med(hot, 'submit'), hotFinish: med(hot, 'finish'), hotPostJs: med(hot, 'js'),
    worst: rows.slice().sort((a, b) => (b.submit + b.finish) - (a.submit + a.finish)).slice(0, 5),
  };
};
const out = [await pass(false), await pass(true), await pass(true), await pass(false)];
g.post.render = orig;
menus.setScreen(null);
return out;
