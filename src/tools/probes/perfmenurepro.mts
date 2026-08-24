// perf-r2: minimal repro of the menu stall, cheap enough to bisect with.
// Opens the pause menu, holds it, times 120 frames, counts frames over 33 ms.
// `menu-open` had ZERO hitches in the certified baseline (`acdcebb`), so this
// is a regression and a bisect is the fastest route to the cause.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const pass = async (open) => {
  menus.setScreen(null);
  for (let i = 0; i < 30; i++) g.frame(dt);
  if (open) { menus.setScreen('main'); for (let i = 0; i < 40; i++) g.frame(dt); }
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
  return { median: +so[60].toFixed(2), max: +so[119].toFixed(2), over33: s.filter((x) => x > 33).length };
};
const closed = [await pass(false), await pass(false)];
const opened = [await pass(true), await pass(true)];
menus.setScreen(null);
return { closed, opened, hitchesClosed: closed[0].over33 + closed[1].over33, hitchesOpen: opened[0].over33 + opened[1].over33 };
