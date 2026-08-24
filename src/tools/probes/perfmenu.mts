// perf-r2: is the `menu-open` hitch the scrim's 26 px backdrop-filter?
//
// Every hitch in that segment lands on `post.render` with ZERO new programs,
// geometries or textures -- so it is not first-touch work, which is what the
// old handoff assumed. `Menus.update` rewrites
// `scrim.style.backdropFilter = blur(<e*26>px) ...` every single frame, with a
// new radius string each time, over the full 1600x900 viewport. That is a
// full-screen compositor blur the browser cannot cache, on the same GPU the
// renderer is waiting on in `gl.finish()`.
//
// ABBA, four passes, so machine drift cannot produce the answer.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const origUpdate = menus.update;
let kill = false;
menus.update = function (...a) {
  const r = origUpdate.apply(this, a);
  if (kill && this.scrim) {
    this.scrim.style.backdropFilter = 'none';
    this.scrim.style.setProperty('-webkit-backdrop-filter', 'none');
  }
  return r;
};

const script = (i) => {
  if (i === 5) menus.setScreen('main');
  if (i === 30) menus.setScreen('ascension');
  if (i === 55) menus.setScreen('inventory');
  if (i === 80) menus.setScreen(null);
};

const pass = async (off) => {
  kill = off;
  menus.setScreen(null);
  for (let i = 0; i < 20; i++) g.frame(dt);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  for (let i = 0; i < 90; i++) {
    script(i);
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 0));
  }
  const so = [...s].sort((a, b) => a - b);
  return { medianMs: +so[45].toFixed(2), p95: +so[85].toFixed(2), maxMs: +so[89].toFixed(2),
           over33: s.filter((x) => x > 33).length, sumMs: +s.reduce((a, b) => a + b, 0).toFixed(0) };
};

const A1 = await pass(false), B1 = await pass(true), B2 = await pass(true), A2 = await pass(false);
menus.update = origUpdate;
menus.setScreen(null);
return {
  blurOn: [A1, A2],
  blurOff: [B1, B2],
  hitchesOn: A1.over33 + A2.over33,
  hitchesOff: B1.over33 + B2.over33,
};
