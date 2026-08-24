// perf-r2: the `menu-open` stall is not the menu's DOM and not its update.
//
// Detaching `menus.root` from the document entirely still spikes (20 hitches);
// no menu at all never does (0). Skipping `Menus.update` and skipping the
// screen's own `update` both leave it intact. So opening a screen leaves some
// state behind that makes ScenePass stall. `_pointerLock` sets exactly three
// things: `input.enabled = false`, `setPointerLockAllowed(false)` and (via
// `Menus.update`) `HUD.setMenuOpen(true)`. Each is forced here WITHOUT a menu.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const hud = g.get('HUD');
const inp = g.input;
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
inp.keys.clear();

const home = menus.root.parentNode;
const run = async (label) => {
  // reset to plain gameplay
  menus.setScreen(null);
  if (!menus.root.parentNode) home.appendChild(menus.root);
  inp.enabled = true;
  if (inp.setPointerLockAllowed) inp.setPointerLockAllowed(true);
  if (hud) hud.setMenuOpen(false);
  for (let i = 0; i < 40; i++) g.frame(dt);

  if (label === 'menu-detached') { menus.setScreen('main'); for (let i = 0; i < 40; i++) g.frame(dt); menus.root.remove(); }
  if (label === 'input-disabled') inp.enabled = false;
  if (label === 'lock-released' && inp.setPointerLockAllowed) inp.setPointerLockAllowed(false);
  if (label === 'hud-menuopen' && hud) hud.setMenuOpen(true);

  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  for (let i = 0; i < 90; i++) {
    if (label === 'input-disabled') inp.enabled = false;
    if (label === 'hud-menuopen' && hud) hud.setMenuOpen(true);
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
for (const m of ['none', 'menu-detached', 'input-disabled', 'lock-released', 'hud-menuopen',
                 'hud-menuopen', 'lock-released', 'input-disabled', 'menu-detached', 'none']) out.push(await run(m));
menus.setScreen(null);
if (!menus.root.parentNode) home.appendChild(menus.root);
inp.enabled = true;
if (inp.setPointerLockAllowed) inp.setPointerLockAllowed(true);
if (hud) hud.setMenuOpen(false);
const agg = {};
for (const r of out) { const a = agg[r.label] || (agg[r.label] = { over33: 0, over16: 0, max: 0 }); a.over33 += r.over33; a.over16 += r.over16; a.max = Math.max(a.max, r.maxMs); }
return agg;
