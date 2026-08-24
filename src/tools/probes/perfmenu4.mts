// perf-r2: which screen, and is it `Menus.update` or the screen's own update?
//
// ScenePass goes 3.5 -> 37.6 ms on the spike frames with the SAME 586 draw
// calls and the same triangles, so it is a stall, not work. It only happens
// while a menu is open. This holds one screen open for a long run at a time,
// and adds two ablations: `Menus.update` skipped entirely, and the active
// screen's own `update` skipped.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const origUpdate = menus.update;
let skipMenus = false, skipScreen = false;
const screenOrig = new Map();
for (const k of Object.keys(menus.screens || {})) {
  const s = menus.screens[k];
  if (s && typeof s.update === 'function') {
    screenOrig.set(s, s.update);
    s.update = function (...a) { return skipScreen ? undefined : screenOrig.get(this).apply(this, a); };
  }
}
menus.update = function (...a) { return skipMenus ? undefined : origUpdate.apply(this, a); };

const run = async (label, open, opts = {}) => {
  skipMenus = false; skipScreen = false;
  menus.setScreen(null);
  for (let i = 0; i < 30; i++) g.frame(dt);
  if (open) menus.setScreen(open);
  for (let i = 0; i < 40; i++) g.frame(dt);      // let the open animation finish
  skipMenus = !!opts.skipMenus; skipScreen = !!opts.skipScreen;
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  for (let i = 0; i < 90; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 0));
  }
  const so = [...s].sort((a, b) => a - b);
  return { label, medianMs: +so[45].toFixed(2), p95: +so[85].toFixed(2), maxMs: +so[89].toFixed(2),
           over16: s.filter((x) => x > 16.7).length, over33: s.filter((x) => x > 33).length };
};

const out = [];
out.push(await run('none', null));
out.push(await run('main', 'main'));
out.push(await run('ascension', 'ascension'));
out.push(await run('inventory', 'inventory'));
out.push(await run('main, Menus.update skipped', 'main', { skipMenus: true }));
out.push(await run('main, screen.update skipped', 'main', { skipScreen: true }));
out.push(await run('none (again)', null));
out.push(await run('main (again)', 'main'));

menus.update = origUpdate;
for (const [s, f] of screenOrig) s.update = f;
menus.setScreen(null);
return out;
