// perf-r2: the `menu-open` stall, ablated at the DOM.
//
// Not the code: skipping `Menus.update` or the screen's own `update` leaves the
// spike intact, and every screen shows it. So the remaining variable is the
// menu's DOM itself. Four states, held open, 90 timed frames each:
//   detached  - `menus.root` removed from the document entirely
//   hidden    - still in the document, `display:none`
//   noblur    - shown, but every `backdrop-filter` in the page forced off
//               (the .plate/.menu-scrim CSS rules, not just the inline one)
//   shown     - untouched
// plus a no-menu control at each end.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const style = document.createElement('style');
style.textContent = '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';

const origUpdate = menus.update;
let mode = 'shown';
menus.update = function (...a) {
  const r = origUpdate.apply(this, a);
  if (mode === 'hidden' && this.root) this.root.style.display = 'none';
  return r;
};

const run = async (label) => {
  mode = label;
  if (style.parentNode) style.remove();
  if (!menus.root.parentNode) menus._home.appendChild(menus.root);
  menus.root.style.display = '';
  menus.setScreen(null);
  for (let i = 0; i < 30; i++) g.frame(dt);
  if (label !== 'nomenu') { menus.setScreen('main'); for (let i = 0; i < 40; i++) g.frame(dt); }
  if (label === 'detached') menus.root.remove();
  if (label === 'noblur') document.head.appendChild(style);
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
menus._home = menus.root.parentNode;

const out = [];
for (const m of ['nomenu', 'shown', 'noblur', 'hidden', 'detached', 'detached', 'hidden', 'noblur', 'shown', 'nomenu']) {
  out.push(await run(m));
}
menus.update = origUpdate;
if (style.parentNode) style.remove();
if (!menus.root.parentNode) menus._home.appendChild(menus.root);
menus.setScreen(null);
const agg = {};
for (const r of out) { const a = agg[r.label] || (agg[r.label] = { over33: 0, over16: 0, max: 0 }); a.over33 += r.over33; a.over16 += r.over16; a.max = Math.max(a.max, r.maxMs); }
return { passes: out, totals: agg };
